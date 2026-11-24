"""Conservative freshness: healthy daily snapshots, outages, replay and expiry."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from opportunity_api.ingestion.freshness import FreshnessTracker
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.report import IngestionReport
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.models import IngestionSourceState, Opportunity
from tests.test_ingestion_runner import StaticAdapter, make_raw
from tests.test_opportunities import make_opportunity

NOW = datetime(2026, 11, 17, 12, tzinfo=UTC)
SOURCE = "greenhouse.fixture"


def assess(session, observations=(), *, fetched=1, failed=0, now=NOW, dry_run=False):
    report = IngestionReport(dry_run=dry_run)
    source = report.source(SOURCE)
    source.fetched = fetched
    source.failed = failed
    FreshnessTracker(session, clock=lambda: now).assess(
        SOURCE, observations, source, report, dry_run=dry_run
    )
    return report


def seed_row(db_factory, **kwargs):
    kwargs = {"title": "Software Engineering Intern", "location": "Berlin, Germany", **kwargs}
    row = make_opportunity(source=SOURCE, source_id="known-job", **kwargs)
    with db_factory() as session:
        session.add(row)
        session.commit()
    return row


def test_three_healthy_missing_days_inactivate_but_never_delete(db_factory):
    row = seed_row(db_factory)
    with db_factory() as session:
        for day in range(3):
            result = assess(session, now=NOW + timedelta(days=day))
            # Same-day replay must not consume another missing-run allowance.
            assess(session, now=NOW + timedelta(days=day))
            stored = session.get(Opportunity, row.id)
            assert stored.missing_runs == day + 1
            assert stored.is_active == (day < 2)
        assert result.totals().inactivated == 1
        assert session.get(Opportunity, row.id).inactive_reason == "source_missing"


def test_live_row_the_scope_now_rejects_is_hidden_even_when_unseen(db_factory):
    row = seed_row(db_factory, title="Werkstudent (m/w/d) Customer Service")
    with db_factory() as session:
        assert assess(session, dry_run=True).totals().inactivated == 1
        assert session.get(Opportunity, row.id).is_active is True  # preview only
        assert assess(session).totals().inactivated == 1
        stored = session.get(Opportunity, row.id)
        assert stored.is_active is False
        assert stored.inactive_reason is None  # like a withdrawal: can be republished


def test_observation_resets_misses_without_automatic_reactivation(db_factory):
    row = seed_row(db_factory, is_active=False, missing_runs=3, inactive_reason="source_missing")
    with db_factory() as session:
        result = assess(session, [("known-job", None)])
        stored = session.get(Opportunity, row.id)
        assert stored.missing_runs == 0
        assert stored.last_seen_at is not None
        assert stored.is_active is False
        assert result.totals().seen == 1


def test_zero_partial_or_suspicious_drop_never_counts_missing(db_factory):
    row = seed_row(db_factory)
    with db_factory() as session:
        assess(session, [("known-job", None)], fetched=100)
        for fetched, failed in [(0, 0), (50, 1), (1, 0)]:
            result = assess(session, fetched=fetched, failed=failed, now=NOW + timedelta(days=1))
            assert session.get(Opportunity, row.id).missing_runs == 0
            assert session.get(Opportunity, row.id).is_active
            assert result.totals().freshness_skipped == 1
        assert session.get(IngestionSourceState, SOURCE).fetched == 100


def test_expired_deadline_inactivates_even_when_source_is_empty(db_factory):
    row = seed_row(db_factory, deadline=NOW - timedelta(days=1))
    with db_factory() as session:
        result = assess(session, fetched=0)
        stored = session.get(Opportunity, row.id)
        assert stored.is_active is False
        assert stored.inactive_reason == "deadline_expired"
        assert result.totals().inactivated == 1


def test_dry_run_predicts_without_mutating_rows_or_source_state(db_factory):
    row = seed_row(db_factory, deadline=NOW - timedelta(days=1))
    with db_factory() as session:
        result = assess(session, dry_run=True)
        assert result.totals().inactivated == 1
        assert session.get(Opportunity, row.id).is_active
        assert session.get(Opportunity, row.id).last_checked_on is None
        assert session.get(IngestionSourceState, SOURCE) is None


def test_high_rejection_and_duplicate_ratios_emit_safe_alerts(db_factory):
    with db_factory() as session:
        report = IngestionReport()
        source = report.source(SOURCE)
        source.fetched = 100
        source.rejected = 98
        source.duplicates = 90
        FreshnessTracker(session, clock=lambda: NOW).assess(SOURCE, [], source, report)
        assert {issue.code for issue in report.issues} == {
            "high_rejection_ratio",
            "high_duplicate_ratio",
        }
        assert report.to_dict()["quality"]["official_links_checked"] is False


def test_runner_tracks_rejected_but_still_observed_canonical_rows(db_factory):
    row = seed_row(db_factory)
    with db_factory() as session:
        raw = make_raw(SOURCE, 1, source_id="known-job", title="Senior Software Engineer")
        result = IngestionRunner(OpportunityStore(session), track_freshness=True).run(
            [StaticAdapter(SOURCE, [raw])]
        )
        assert result.source(SOURCE).rejected == 1
        assert result.source(SOURCE).seen == 1
        assert session.get(Opportunity, row.id).missing_runs == 0


def test_runner_can_preview_freshness_without_committing(db_factory):
    with db_factory() as session:
        result = IngestionRunner(OpportunityStore(session), track_freshness=True, dry_run=True).run(
            [StaticAdapter(SOURCE, [make_raw(SOURCE, 1)])]
        )
        assert result.source(SOURCE).would_create == 1
        assert list(session.scalars(select(IngestionSourceState))) == []


def test_summary_reports_actual_counts_and_sanitizes_source_labels():
    from opportunity_api.ingestion.summary import render_report

    report = IngestionReport()
    source = report.source(SOURCE)
    source.fetched = 10
    source.inactivated = 2
    report.issue(SOURCE, None, "health", "source_zero", "safe message", "warning")
    summary = render_report(report.to_dict())
    assert "greenhouse.fixture | 10 | 0 | 0 | 0 | 0 | 2" in summary
    assert "Health/freshness notices: 1" in summary
    assert "Official links were not checked" in summary
    assert "|" not in render_report({"sources": {"bad|label": {}}}).splitlines()[4].split(" | ")[0]


def test_failed_freshness_transaction_does_not_report_or_keep_inactivation(db_factory, monkeypatch):
    with db_factory() as session:
        raw = make_raw(SOURCE, 1)
        store = OpportunityStore(session)
        IngestionRunner(store).run([StaticAdapter(SOURCE, [raw])])
        row = session.scalar(select(Opportunity))
        row.is_active = True
        session.commit()

        def fail(tracker, name, observations, source, report, **kwargs):
            row.is_active = False
            source.inactivated += 1
            raise RuntimeError("synthetic freshness failure")

        monkeypatch.setattr(FreshnessTracker, "assess", fail)
        result = IngestionRunner(store, track_freshness=True).run([StaticAdapter(SOURCE, [raw])])
        assert session.get(Opportunity, row.id).is_active
        assert result.source(SOURCE).inactivated == 0
        assert result.source(SOURCE).source_failures == 1
        assert result.failed_sources == [SOURCE]


def test_expired_postings_from_any_source_are_hidden(db_factory):
    from opportunity_api.ingestion.freshness import expire_past_deadlines

    past, future = NOW - timedelta(days=1), NOW + timedelta(days=1)
    curated = make_opportunity(source="seed_supplemental", deadline=past)
    open_ = make_opportunity(source="seed_supplemental", deadline=future)
    undated = make_opportunity(source="greenhouse.fixture", deadline=None)
    with db_factory() as session:
        session.add_all([curated, open_, undated])
        session.commit()
        assert expire_past_deadlines(session, NOW) == 1
        session.commit()
        session.expire_all()
        assert session.get(Opportunity, curated.id).inactive_reason == "deadline_expired"
        assert session.get(Opportunity, curated.id).is_active is False
        assert session.get(Opportunity, open_.id).is_active is True
        assert session.get(Opportunity, undated.id).is_active is True
        assert expire_past_deadlines(session, NOW) == 0  # idempotent
