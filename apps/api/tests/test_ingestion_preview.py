"""Run-local identity predictions must match sequential A15 persistence."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from opportunity_api.ingestion.models import RawOpportunity
from opportunity_api.ingestion.normalize import normalize
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.smoke import FixtureAdapter
from opportunity_api.ingestion.validate import validate
from opportunity_api.models import Application, ApplicationStatus, Opportunity, User
from tests.ingestion_helpers import local_database, snapshot


def raw(identifier, url, *, source="fixture", **changes):
    return RawOpportunity(
        source=source,
        source_id=identifier,
        source_url=url,
        title="Software Engineering Intern",
        organization="Fixture",
        location="Germany",
        **changes,
    )


def feeds(*records):
    # Preserve source order and allow two distinct adapters for the same source.
    return [FixtureAdapter(record.source, [record]) for record in records]


@pytest.mark.parametrize("cross_source", [False, True])
def test_url_move_reuse_and_duplicate_match_apply_across_sources(tmp_path, cross_source):
    engine, _url = local_database(tmp_path)
    old, new = "https://example.invalid/jobs/old", "https://example.invalid/jobs/new"
    try:
        with Session(engine, autoflush=False) as session:
            store = OpportunityStore(session)
            IngestionRunner(store).run(feeds(raw("A", old)))
            saved = session.scalar(select(Opportunity))
            original_id = saved.id
            app = Application(
                user=User(email="fixture@example.invalid", full_name="Fixture"),
                opportunity=saved,
                status=ApplicationStatus.applied,
                notes="Keep notes",
            )
            session.add(app)
            session.commit()
            app_id = app.id
            second_source = "second" if cross_source else "fixture"
            a, b = raw("A", new), raw("B", old, source=second_source)
            duplicate = raw("mirror", old, source="mirror")
            batch = (
                feeds(a, b, duplicate)
                if cross_source
                else [FixtureAdapter("fixture", [a, b]), FixtureAdapter("mirror", [duplicate])]
            )
            before = snapshot(engine)

            def no_write(*_a, **_k):
                pytest.fail("preview attempted ORM writes")

            with pytest.MonkeyPatch.context() as patch:
                patch.setattr(session, "flush", no_write)
                patch.setattr(session, "commit", no_write)
                preview_runner = IngestionRunner(store, dry_run=True)
                first = preview_runner.run(batch)
                second = preview_runner.run(batch)
            for report in (first, second):
                assert report.totals().would_update == 1
                assert report.totals().would_create == 1
                assert report.totals().duplicates == 1
                assert report.totals().failed == report.totals().review_required == 0
            assert not session.dirty and not session.new and not session.deleted
            assert saved.url == old and saved.id == original_id
            assert snapshot(engine) == before
            actual = IngestionRunner(store).run(batch)
            assert actual.totals().updated == first.totals().would_update
            assert actual.totals().created == first.totals().would_create
            assert actual.totals().duplicates == first.totals().duplicates
            session.expire_all()
            assert session.get(Opportunity, original_id).url == new
            assert session.get(Application, app_id).opportunity_id == original_id
            assert session.get(Application, app_id).notes == "Keep notes"
            assert session.get(Application, app_id).status == ApplicationStatus.applied
            # A fresh preview reloads the now-updated catalogue, not stale virtual state.
            repeat = IngestionRunner(store, dry_run=True).run(batch)
            assert repeat.totals().would_create == 0 and repeat.totals().would_update == 2
            assert repeat.totals().duplicates == 1
            replay = IngestionRunner(store).run(batch)
            assert replay.totals().created == 0 and replay.totals().updated == 2
    finally:
        engine.dispose()


def test_preview_keeps_existing_native_id_when_incoming_id_missing(tmp_path):
    engine, _url = local_database(tmp_path)
    old, new = "https://example.invalid/jobs/old", "https://example.invalid/jobs/new"
    try:
        with Session(engine) as session:
            store = OpportunityStore(session)
            IngestionRunner(store).run(feeds(raw("A", old)))
            original = session.scalar(select(Opportunity))
            store.begin_preview()
            assert store.preview(validate(normalize(raw(None, old)))) == "update"
            assert store.preview(validate(normalize(raw("A", new)))) == "update"
            assert store.preview(validate(normalize(raw("B", old)))) == "create"
            assert store.opportunity_id(validate(normalize(raw("A", new)))) == str(original.id)
            assert original.url == old and original.source_id == "A" and not session.dirty
            store.end_preview()
    finally:
        engine.dispose()


def test_preview_adopts_native_id_without_mutating_generated_id_or_uuid(tmp_path):
    engine, _url = local_database(tmp_path)
    old, new = "https://example.invalid/jobs/old", "https://example.invalid/jobs/new"
    try:
        with Session(engine) as session:
            store = OpportunityStore(session)
            IngestionRunner(store).run(feeds(raw(None, old)))
            original = session.scalar(select(Opportunity))
            original_id, original_source_id = original.id, original.source_id
            assert original_source_id.startswith("urlhash:")
            store.begin_preview()
            assert store.preview(validate(normalize(raw("A", old)))) == "update"
            assert store.preview(validate(normalize(raw("A", new)))) == "update"
            assert store.preview(validate(normalize(raw("B", old)))) == "create"
            assert store.opportunity_id(validate(normalize(raw("A", new)))) == str(original_id)
            assert original.source_id == original_source_id and original.url == old
            assert not session.dirty
            store.end_preview()
    finally:
        engine.dispose()


def test_transient_rows_have_no_invented_canonical_uuid_and_weak_matches_stay_duplicates(tmp_path):
    engine, _url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            store = OpportunityStore(session)
            store.begin_preview()
            first = validate(
                normalize(
                    raw(None, "https://example.invalid/careers?lang=en", deadline_raw="2027-02-03")
                )
            )
            second = first.model_copy(update={"url": "https://example.invalid/careers?lang=de"})
            assert store.preview(first) == "create"
            assert store.opportunity_id(first) is None
            assert store.preview(second) == "duplicate"
            assert store.opportunity_id(second) is None
            assert not session.dirty and not session.new
            store.end_preview()
    finally:
        engine.dispose()


def test_snapshot_resets_after_source_iteration_failure_and_between_runs(tmp_path):
    engine, _url = local_database(tmp_path)
    try:
        with Session(engine) as session:
            store = OpportunityStore(session)
            old = raw("A", "https://example.invalid/jobs/old")
            new = raw("A", "https://example.invalid/jobs/new")
            IngestionRunner(store).run(feeds(old))

            class Partial(FixtureAdapter):
                def fetch(self):
                    yield new
                    raise TimeoutError()

            report = IngestionRunner(store, dry_run=True).run(
                [Partial("fixture", []), *feeds(raw("B", old.source_url, source="second"))]
            )
            assert report.failed_sources == ["fixture"]
            assert report.totals().would_update == report.totals().would_create == 1
            assert store._preview is None
            clean = IngestionRunner(store, dry_run=True).run(feeds(old))
            assert clean.totals().would_update == 1 and not clean.issues
    finally:
        engine.dispose()
