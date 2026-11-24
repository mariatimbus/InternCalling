"""Count missing days only after healthy complete source snapshots; never delete."""

from datetime import UTC, datetime

from sqlalchemy import select

from opportunity_api.models import IngestionSourceState, Opportunity

from .dedupe import utc
from .normalize import canonical_url
from .scope import assess_scope


class FreshnessTracker:
    def __init__(self, session, *, missing_limit=3, clock=None):
        if missing_limit < 2:
            raise ValueError("Use at least two healthy missing snapshots")
        self.session = session
        self.missing_limit = missing_limit
        self.clock = clock or (lambda: datetime.now(UTC))

    def assess(self, name, observations, source, report, *, dry_run=False, european_source=False):
        now = self.clock()
        today = now.date()
        state_query = select(IngestionSourceState).where(IngestionSourceState.source == name)
        if not dry_run:
            state_query = state_query.with_for_update()
        state = self.session.scalar(state_query.execution_options(populate_existing=True))
        previous = state.fetched if state else 0
        fetched = source.fetched
        rejection = source.rejected / fetched if fetched else 0
        duplicates = source.duplicates / fetched if fetched else 0

        def alert(code, message):
            report.issue(name, None, "health", code, message, "warning")

        if fetched == 0:
            alert(
                "source_zero" if previous else "source_empty",
                "Source returned no records; missing counters are unchanged.",
            )
        drop = previous >= 10 and fetched < previous * 0.2
        if drop:
            alert(
                "source_volume_drop",
                "Source volume fell below 20% of the previous healthy snapshot.",
            )
        if fetched >= 20:
            if rejection > 0.95 and (state is None or rejection - state.rejection_ratio > 0.2):
                alert(
                    "high_rejection_ratio",
                    "Unusual rejection ratio; inspect scope and parser changes.",
                )
            if duplicates > 0.8 and (state is None or duplicates - state.duplicate_ratio > 0.2):
                alert(
                    "high_duplicate_ratio",
                    "Unusual duplicate ratio; inspect identities and source overlap.",
                )
        healthy = fetched > 0 and not source.failed and not source.source_failures and not drop
        if not healthy:
            source.freshness_skipped += 1
        identities = set()
        urls = set()
        for identity, url in observations:
            if isinstance(identity, str) and identity:
                identities.add(identity)
            if isinstance(url, str):
                try:
                    urls.add(canonical_url(url))
                except ValueError:
                    pass
        query = select(Opportunity).where(Opportunity.source == name)
        if not dry_run:
            query = query.with_for_update()
        rows = self.session.scalars(query.execution_options(populate_existing=True))
        for row in rows:
            seen = row.source_id in identities or row.url in urls
            expired = row.deadline is not None and utc(row.deadline) < now
            if seen:
                source.seen += 1
                if not dry_run:
                    row.last_seen_at = now
                    row.missing_runs = 0
            newly_checked = row.last_checked_on is None or row.last_checked_on < today
            missing = row.missing_runs or 0
            if healthy and newly_checked and not seen:
                missing += 1
                source.missing += 1
                if not dry_run:
                    row.missing_runs = missing
            reason = (
                "deadline_expired"
                if expired
                else "source_missing"
                if healthy and missing >= self.missing_limit
                else None
            )
            if (
                row.is_active
                and not reason
                and row.review_status != "approved"  # a reviewer's call outranks the rules
                and not assess_scope(
                    row.title, row.description, row.location, european_source=european_source
                ).accepted
            ):
                # Rules tighten over time and a posting the source stopped listing is never
                # re-fetched. Hidden like a scope withdrawal: no reason, so it can return.
                source.inactivated += 1
                if not dry_run:
                    row.is_active = False
            if row.is_active and reason:
                source.inactivated += 1
                if not dry_run:
                    row.is_active = False
                    row.inactive_reason = reason
            if not dry_run and (healthy or seen) and newly_checked:
                row.last_checked_on = today
        # Retain the last positive baseline through outages and suspicious volume drops.
        if healthy and not dry_run and (state is None or state.last_snapshot_on <= today):
            if state is None:
                state = IngestionSourceState(source=name)
                self.session.add(state)
            state.last_success_at = now
            state.last_snapshot_on = today
            state.fetched = fetched
            state.rejection_ratio = rejection
            state.duplicate_ratio = duplicates
        if not dry_run:
            self.session.commit()
