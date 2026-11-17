"""C5: configured real parsers -> C3 -> A15; never contact hosted resources."""

import json

import pytest
from sqlalchemy import event, func, select, text
from sqlalchemy.orm import Session

from opportunity_api.ingestion.database import ingestion_session
from opportunity_api.ingestion.models import RawOpportunity
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.registry import build_registry
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.smoke import FixtureAdapter
from opportunity_api.models import Application, ApplicationStatus, Opportunity, User
from tests.ingestion_helpers import FixtureClient, configuration, local_database, snapshot


@pytest.fixture(autouse=True)
def no_live_http(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("live HTTP is forbidden in C5 integration tests")

    monkeypatch.setattr("urllib.request.OpenerDirector.open", forbidden)


def adapters(tmp_path, client=None):
    providers, employers = configuration(tmp_path)
    return build_registry(
        providers=providers, employers=employers, client=client or FixtureClient()
    ).resolve()


def test_full_pipeline_reruns_preserve_ids_and_application_fk(tmp_path):
    engine, _url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            runner = IngestionRunner(OpportunityStore(session))
            first = runner.run(adapters(tmp_path))
            rows = list(session.scalars(select(Opportunity)))
            identities = {r.source: r.id for r in rows}
            assert first.totals().created == 3
            assert all(not row.is_active for row in rows)
            target = next(r for r in rows if r.source == "greenhouse.fixture")
            application = Application(
                user=User(email="fixture@example.invalid", full_name="Fixture"),
                opportunity=target,
                status=ApplicationStatus.applied,
                notes="Keep application notes",
            )
            session.add(application)
            session.commit()
            app_id, target_id = application.id, target.id
            second = runner.run(adapters(tmp_path))
            assert second.totals().created == 0 and second.totals().updated == 3
            third = runner.run(adapters(tmp_path, FixtureClient(changed=True)))
            assert third.totals().created == 0 and third.totals().updated == 3
            session.expire_all()
            assert {r.source: r.id for r in session.scalars(select(Opportunity))} == identities
            app = session.get(Application, app_id)
            assert app.opportunity_id == target_id
            assert app.status == ApplicationStatus.applied and app.notes == "Keep application notes"
            assert session.get(Opportunity, target_id).title.endswith("Updated")
            assert session.scalar(select(func.count()).select_from(Opportunity)) == 3
            # SQLite FK enforcement is actually enabled, not just declared.
            assert session.scalar(text("PRAGMA foreign_keys")) == 1
    finally:
        engine.dispose()


def test_structured_rejections_failures_duplicates_and_review(tmp_path):
    engine, _url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            report = IngestionRunner(OpportunityStore(session)).run(
                adapters(tmp_path, FixtureClient(mixed=True))
            )
            payload = report.to_dict()
            gh = payload["sources"]["greenhouse.fixture"]
            assert {
                k: gh[k]
                for k in (
                    "fetched",
                    "accepted",
                    "created",
                    "updated",
                    "duplicates",
                    "rejected",
                    "failed",
                )
            } == {
                "fetched": 5,
                "accepted": 4,
                "created": 2,
                "updated": 0,
                "duplicates": 1,
                "rejected": 1,
                "failed": 1,
            }
            assert gh["status"] == "failed"
            assert payload["run_id"] and payload["started_at"] <= payload["finished_at"]
            assert {i["code"] for i in payload["issues"]} >= {
                "not_student_role",
                "invalid_url",
                "duplicate_provider_id",
                "scope_ambiguous",
            }
            assert all(i["message"] for i in payload["issues"])
            assert "private-sentinel" not in json.dumps(payload)
            assert payload["review_records"][0]["persistence"] == "persisted"
    finally:
        engine.dispose()


def test_one_real_adapter_failure_does_not_stop_other_providers(tmp_path):
    engine, _url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            report = IngestionRunner(OpportunityStore(session)).run(
                adapters(tmp_path, FixtureClient(broken="lever"))
            )
            assert report.totals().created == 2
            assert report.failed_sources == ["lever.fixture"]
            failed = report.to_dict()["sources"]["lever.fixture"]
            assert failed["status"] == "failed" and failed["source_failures"] == 1
            assert failed["failed"] == 0  # no invented count of unseen records
            assert "timed out" in report.issues[0].message
            assert "private-sentinel" not in report.render()
    finally:
        engine.dispose()


def test_dry_run_all_stages_no_writes_or_uuid_changes(tmp_path, monkeypatch):
    engine, url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            IngestionRunner(OpportunityStore(session)).run(adapters(tmp_path))
        before = snapshot(engine)

        def forbidden(*_args, **_kwargs):
            pytest.fail("dry-run attempted a write/flush/commit")

        with ingestion_session(url, dry_run=True) as session:
            connection = session.connection()

            @event.listens_for(connection, "before_cursor_execute")
            def read_only(_conn, _cursor, statement, _params, _context, _many):
                assert statement.lstrip().upper().startswith(("SELECT", "PRAGMA"))

            store = OpportunityStore(session)
            for name in ("upsert", "commit", "hold_for_review"):
                monkeypatch.setattr(store, name, forbidden)
            monkeypatch.setattr(session, "flush", forbidden)
            monkeypatch.setattr(session, "commit", forbidden)
            report = IngestionRunner(store, dry_run=True).run(
                adapters(tmp_path, FixtureClient(mixed=True, changed=True))
            )
            assert not report.failed_sources
            assert report.totals().would_update == 3
            assert report.totals().would_create == 1
            assert report.totals().duplicates == 1
            assert report.totals().rejected == 1 and report.totals().failed == 1
            assert report.totals().created == report.totals().updated == 0
            assert report.review_records()[0]["persistence"] == "dry_run"
        assert snapshot(engine) == before
    finally:
        engine.dispose()


def test_dry_run_stored_cross_source_duplicate_matches_actual_upsert(tmp_path):
    engine, url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            IngestionRunner(OpportunityStore(session)).run(adapters(tmp_path))
            saved = session.scalar(select(Opportunity).where(Opportunity.source == "lever.fixture"))
            original_id = saved.id
            raw = RawOpportunity(
                source="other.fixture",
                source_id="other-id",
                source_url=saved.url,
                title=saved.title,
                organization=saved.organization,
                description=saved.description,
                location=saved.location,
            )
        feed = FixtureAdapter(raw.source, [raw])
        with ingestion_session(url, dry_run=True) as session:
            report = IngestionRunner(OpportunityStore(session), dry_run=True).run([feed])
            assert report.totals().duplicates == 1
            assert report.totals().would_update == 0
        with Session(engine) as session:
            report = IngestionRunner(OpportunityStore(session)).run([feed])
            assert report.totals().duplicates == 1 and report.totals().updated == 0
            assert session.get(Opportunity, original_id).source == "lever.fixture"
    finally:
        engine.dispose()
