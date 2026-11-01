"""A15 orchestration with C3 stages: cleanup/normalize -> scope -> validate -> dedupe.

Existing injectable callable signatures, counters and dry-run behavior are retained.
Review records are inactive; records without a usable official URL remain in the report.
"""

from collections.abc import Callable, Iterable

from pydantic import ValidationError

from .dedupe import Deduplicator
from .models import RawOpportunity
from .normalize import clean_text
from .normalize import normalize as default_normalize
from .persistence import NormalizedOpportunity, OpportunityStore
from .report import IngestionError, IngestionReport, Notice, record_notices, safe_source
from .scope import assess_scope
from .sources.base import SourceAdapter
from .validate import validate as validate_record
from .validate import validation_error

Normalizer = Callable[[RawOpportunity], object]
Dedupe = Callable[[NormalizedOpportunity], bool]
Validate = Callable[[object], NormalizedOpportunity]


class IngestionRunner:
    def __init__(
        self,
        store: OpportunityStore,
        *,
        normalizer: Normalizer = default_normalize,
        validate: Validate = validate_record,
        dedupe: Dedupe | None = None,
        dry_run: bool = False,
    ) -> None:
        self.store = store
        self.normalizer = normalizer
        self.validate = validate
        self.dedupe = dedupe
        self.dry_run = dry_run

    def run(self, adapters: Iterable[SourceAdapter]) -> IngestionReport:
        report = IngestionReport(dry_run=self.dry_run)
        seen = Deduplicator()  # never retain a batch's seen state for the next run
        for adapter in adapters:
            self._run_adapter(adapter, report, seen)
        return report

    def _run_adapter(
        self,
        adapter: SourceAdapter,
        report: IngestionReport,
        seen: Deduplicator,
    ) -> None:
        name = adapter.source_name
        source = report.source(name)
        self.store.reset_index()
        pending: list[tuple[NormalizedOpportunity, str]] = []
        created_before, updated_before = source.created, source.updated

        def fetch_failed():
            label = safe_source(name)
            if label not in report.failed_sources:
                report.failed_sources.append(label)
            report.issue(
                name,
                None,
                "fetch",
                "fetch_failed",
                "Source iteration failed; later sources will still run.",
                "failed",
            )

        try:
            iterator = iter(adapter.fetch())
        except Exception:
            fetch_failed()
            return
        number = 0
        while True:
            try:
                raw = next(iterator)
            except StopIteration:
                break
            except Exception:
                fetch_failed()
                break
            number += 1
            source.fetched += 1
            identity = f"row:{number}"
            if isinstance(raw, RawOpportunity):
                identity = raw.source_id or raw.source_url or identity
            elif isinstance(raw, dict):
                candidate = raw.get("source_id") or raw.get("source_url")
                if isinstance(candidate, str):
                    identity = candidate
            stage = "raw"
            reviewed = False
            notices: list[Notice] = []

            def mark_review():
                nonlocal reviewed
                if not reviewed:
                    source.review_required += 1
                    reviewed = True

            def add_notices(value, row_notices, row_identity, mark=mark_review):
                for notice in record_notices(value):
                    if notice in row_notices:
                        continue
                    row_notices.append(notice)
                    if notice.review:
                        mark()
                    report.issue(
                        name,
                        row_identity,
                        "normalize",
                        notice.code,
                        notice.message,
                        "review" if notice.review else "warning",
                    )

            def bind_saved_review(record, needs_review, row_identity, *, hold=False):
                if not needs_review:
                    return
                if hold and not self.dry_run and self.store.hold_for_review(record):
                    pending.append((record, row_identity))
                row_id = self.store.opportunity_id(record)
                report.bind_review(
                    name,
                    row_identity,
                    row_id,
                    "dry_run" if self.dry_run else "persisted" if row_id else "not_persisted",
                )

            try:
                if not isinstance(raw, RawOpportunity):
                    raw = RawOpportunity.model_validate(raw)
                stage = "normalize"
                prepared = self.normalizer(raw)
                if isinstance(prepared, NormalizedOpportunity):
                    fields = prepared.model_dump()
                elif isinstance(prepared, dict):
                    fields = prepared
                else:
                    raise IngestionError(
                        "invalid_record", "Normalizer returned an unsupported record shape."
                    )
                if not isinstance(fields.get("title"), str):
                    raise IngestionError("invalid_title", "A nonblank title is required.")
                stage = "scope"
                decision = assess_scope(
                    clean_text(fields["title"]),
                    fields.get("description"),
                    clean_text(fields.get("location")),
                )
                if not decision.accepted and not decision.requires_review:
                    source.rejected += 1
                    report.issue(name, identity, stage, decision.code, decision.reason, "rejected")
                    continue
                source.accepted += 1
                if decision.requires_review:
                    mark_review()
                    report.issue(name, identity, stage, decision.code, decision.reason, "review")
                add_notices(prepared, notices, identity)
                if self.normalizer is not default_normalize:
                    # Hooks may rebuild models or mappings. Source ambiguity cannot
                    # disappear merely because they drop internal metadata.
                    add_notices(default_normalize(raw), notices, identity)
                stage = "validate"
                normalized = validate_record(self.validate(prepared))
                add_notices(normalized, notices, identity)
                if normalized.source != name:
                    raise IngestionError(
                        "source_mismatch", "Record source differs from its registered adapter."
                    )
                # Scope must cover the actual validated values, not just the input
                # to a hook that can legitimately transform them.
                stage = "scope"
                final_scope = assess_scope(
                    normalized.title, normalized.description, normalized.location
                )
                if not final_scope.accepted and not final_scope.requires_review:
                    source.accepted -= 1
                    source.rejected += 1
                    report.issue(
                        name, identity, stage, final_scope.code, final_scope.reason, "rejected"
                    )
                    continue
                if final_scope.requires_review:
                    mark_review()
                    if not decision.requires_review or decision.reason != final_scope.reason:
                        report.issue(
                            name, identity, stage, final_scope.code, final_scope.reason, "review"
                        )
                normalized._requires_review = reviewed
                normalized._review_notices = tuple(notices)
                stage = "dedupe"
                match = seen.find(normalized)
                if match is not None:
                    bind_saved_review(normalized, reviewed, identity, hold=True)
                    source.duplicates += 1
                    report.issue(
                        name,
                        identity,
                        stage,
                        f"duplicate_{match.kind}",
                        "Record repeats an identity already processed in this run.",
                        "duplicate",
                    )
                    continue
                callback_duplicate = False
                if self.dedupe is not None:
                    before = normalized.model_dump()
                    callback_duplicate = self.dedupe(normalized)
                    if normalized.model_dump() != before:
                        raise IngestionError(
                            "dedupe_mutated_record",
                            "Deduplicator must not modify validated fields.",
                        )
                if callback_duplicate:
                    bind_saved_review(normalized, reviewed, identity, hold=True)
                    source.duplicates += 1
                    report.issue(
                        name,
                        identity,
                        stage,
                        "duplicate_callback",
                        "Injected deduplicator identified a repeated record.",
                        "duplicate",
                    )
                    continue
                # A callback cannot clear metadata accumulated from the source.
                normalized._requires_review = reviewed
                normalized._review_notices = tuple(notices)
                stage = "persistence"
                if self.dry_run:
                    if self.store.classify(normalized) == "create":
                        source.would_create += 1
                    else:
                        source.would_update += 1
                else:
                    result = self.store.upsert(normalized)
                    if result == "created":
                        source.created += 1
                        pending.append((normalized, identity))
                    elif result == "updated":
                        source.updated += 1
                        pending.append((normalized, identity))
                    elif result == "duplicate":
                        if reviewed:
                            pending.append((normalized, identity))
                        source.duplicates += 1
                        report.issue(
                            name,
                            identity,
                            stage,
                            "duplicate_stored_identity",
                            "Stored weak/cross-source identity retained; fields were not merged.",
                            "duplicate",
                        )
                    else:
                        raise IngestionError(
                            "invalid_store_result", "Store returned an unsupported outcome."
                        )
                bind_saved_review(normalized, reviewed, identity)
                seen.remember(normalized)
            except IngestionError as exc:
                if exc.review:
                    mark_review()
                else:
                    source.failed += 1
                report.issue(
                    name,
                    identity,
                    stage,
                    exc.code,
                    exc.message,
                    "review" if exc.review else "failed",
                )
            except ValidationError as exc:
                source.failed += 1
                error = validation_error(exc, raw=stage == "raw")
                report.issue(name, identity, stage, error.code, error.message, "failed")
            except Exception:
                source.failed += 1
                self.store.reset_index()
                report.issue(
                    name,
                    identity,
                    stage,
                    f"{stage}_failed",
                    "Record processing failed; input and exception details are omitted.",
                    "failed",
                )
        if not self.dry_run:
            try:
                self.store.commit()
            except Exception:
                self.store.rollback()
                source.created, source.updated = created_before, updated_before
                source.failed += len(pending)
                label = safe_source(name)
                if label not in report.failed_sources:
                    report.failed_sources.append(label)
                for _record, original_identity in pending:
                    report.bind_review(name, original_identity, None, "rolled_back")
                    report.issue(
                        name,
                        original_identity,
                        "commit",
                        "source_commit_failed",
                        "Source transaction rolled back; this record was not saved.",
                        "failed",
                    )
                # Failed source writes must not suppress a later source's valid records.
                for record, _ in pending:
                    seen.forget(record)
