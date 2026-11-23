"""Persistence: create-or-update opportunities without duplicates.

The shared deduplicator checks provider identity, canonical URL, then a
conservative fallback fingerprint. Conflicts require review rather than merging.
Repeated imports preserve row IDs and avoid duplicate rows; A15 still counts
unchanged matched upserts as updates.

``NormalizedOpportunity`` remains the existing normalize/validate contract at
this import path. New postings are inactive pending publication review, unless the
store runs with ``publish=True``: then in-scope postings that need no review go live.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from opportunity_api.models import Opportunity, OpportunityDegreeLevel, OpportunityType

from .dedupe import Deduplicator, explicit_id, storage_id, utc
from .normalize import canonical_url, clean_text
from .report import IngestionError, Notice

UpsertResult = Literal["created", "updated", "duplicate"]


def _same(previous, value) -> bool:
    if isinstance(previous, datetime) and isinstance(value, datetime):
        return utc(previous) == utc(value)
    return previous == value


class NormalizedOpportunity(BaseModel):
    """Validated, typed record ready for persistence."""

    model_config = ConfigDict(str_strip_whitespace=True)

    source: str = Field(min_length=1, max_length=100)
    source_id: str | None = Field(default=None, max_length=255)
    url: str = Field(min_length=1, max_length=512)
    title: str = Field(min_length=1, max_length=255)
    organization: str | None = Field(default=None, max_length=255)
    description: str | None = None
    opportunity_type: OpportunityType = OpportunityType.internship
    location: str | None = Field(default=None, max_length=255)
    deadline: datetime | None = None
    posted_at: datetime | None = None
    degree_level: OpportunityDegreeLevel | None = None
    study_year: list[int] | None = None
    is_active: Literal[False] = False
    _requires_review: bool = PrivateAttr(default=False)
    _review_notices: tuple[Notice, ...] = PrivateAttr(default=())

    @field_validator("title", "organization", "location", mode="before")
    @classmethod
    def _clean_text(cls, value):
        if isinstance(value, str):
            if "\x00" in value:
                raise ValueError("NUL is not allowed")
            return clean_text(value)
        return value

    @field_validator("source_id", mode="before")
    @classmethod
    def _source_identity(cls, value):
        if isinstance(value, str):
            if "\x00" in value:
                raise ValueError("NUL is not allowed")
            # Preserve meaningful internal whitespace in opaque provider IDs.
            # Outer trimming matches the existing A14 RawOpportunity contract.
            return value.strip() or None
        return value

    @field_validator("url")
    @classmethod
    def _official_url(cls, value: str) -> str:
        return canonical_url(value)

    @field_validator("deadline", "posted_at")
    @classmethod
    def _utc_dates(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("An explicit timezone is required for a timestamp")
            return value.astimezone(UTC)
        return None

    @field_validator("study_year", mode="before")
    @classmethod
    def _study_year_values(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and not value:
            return None
        if value is not None:
            if not isinstance(value, list) or any(
                type(n) is not int or not 1 <= n <= 6 for n in value
            ):
                raise ValueError("Study years must be integers 1-6")
            return sorted(set(value))
        return None


def _row_values(record: NormalizedOpportunity) -> dict[str, object]:
    return record.model_dump(exclude={"source_id", "source", "is_active"})


@dataclass(frozen=True)
class _PreviewRow:
    """Detached identity facts, never an ORM object or a fabricated canonical ID."""

    id: UUID | None
    source: str
    source_id: str | None
    url: str
    title: str
    organization: str | None
    location: str | None
    deadline: datetime | None
    opportunity_type: OpportunityType

    @classmethod
    def copy(cls, record, *, row_id: UUID | None, source_id: str | None):
        return cls(
            id=row_id,
            source=record.source,
            source_id=source_id,
            url=record.url,
            title=record.title,
            organization=record.organization,
            location=record.location,
            deadline=record.deadline,
            opportunity_type=record.opportunity_type,
        )


class _PreviewState:
    """Run-local catalogue simulation using the same Deduplicator as A15 upserts."""

    def __init__(self, rows: Iterable[Opportunity]):
        self.index = Deduplicator()
        for row in rows:
            # Stored URL hashes are fallback identities, not native provider IDs.
            self.index.remember(_PreviewRow.copy(row, row_id=row.id, source_id=explicit_id(row)))

    def predict(self, record: NormalizedOpportunity) -> Literal["create", "update", "duplicate"]:
        match = self.index.find(record, allow_update=True)
        if match is not None:
            existing = match.record
            if match.kind == "fingerprint" or existing.source != record.source:
                return "duplicate"
            replacement = _PreviewRow.copy(
                record,
                row_id=existing.id,
                source_id=explicit_id(existing) or record.source_id,
            )
            self.index.forget(existing)
            self.index.remember(replacement)
            return "update"
        self.index.remember(_PreviewRow.copy(record, row_id=None, source_id=record.source_id))
        return "create"


class OpportunityStore:
    """Session-bound create/update gateway for opportunities."""

    def __init__(self, session: Session, *, publish: bool = False) -> None:
        self.session = session
        self.publish = publish
        self._index: Deduplicator | None = None
        self._by_source: dict[str, dict[str, Opportunity]] = defaultdict(dict)
        self._preview: _PreviewState | None = None

    def reset_index(self) -> None:
        self._index = None

    def _identity_rows(self) -> Iterable[Opportunity]:
        # Full rows: comparing an update needs every field, and lazy-loading the rest
        # cost one round trip per column per record on a distant database.
        with self.session.no_autoflush:
            yield from self.session.scalars(select(Opportunity))

    def _identities(self) -> Deduplicator:
        if self._index is None:
            self._index = Deduplicator()
            self._by_source = defaultdict(dict)
            # One snapshot per run (rebuilt only after a rollback), not one per source.
            for row in self._identity_rows():
                self._remember(row)
        return self._index

    def _remember(self, row: Opportunity) -> None:
        assert self._index is not None
        self._index.remember(row)
        if row.source_id:
            self._by_source[row.source][row.source_id] = row

    def begin_preview(self) -> None:
        """Fresh detached catalogue per run; keep it across source index resets."""
        self._preview = _PreviewState(self._identity_rows())

    def end_preview(self) -> None:
        self._preview = None

    def _find(self, record: NormalizedOpportunity) -> Opportunity | None:
        match = self._identities().find(record, allow_update=True)
        return match.record if match else None

    def classify(self, record: NormalizedOpportunity) -> Literal["create", "update"]:
        """Read-only dry-run decision: would this record create or update?"""
        return "update" if self._find(record) is not None else "create"

    def preview(self, record: NormalizedOpportunity) -> Literal["create", "update", "duplicate"]:
        """Predict and apply identity changes only to the run-local detached snapshot."""
        if self._preview is None:
            self.begin_preview()
        assert self._preview is not None
        return self._preview.predict(record)

    def opportunity_id(self, record: NormalizedOpportunity) -> str | None:
        if self._preview is not None:
            match = self._preview.index.find(record, allow_update=True)
            row = match.record if match is not None else None
        else:
            row = self._find(record)
        return str(row.id) if row is not None and row.id is not None else None

    def hold_for_review(self, record: NormalizedOpportunity) -> bool:
        """Revoke publication for an identified duplicate without merging its fields."""
        self._begin_write()
        row = self._find(record)
        if row is None or not row.is_active:
            return False
        with self.session.begin_nested():
            row.is_active = False
            row.updated_at = datetime.now(UTC)
            self.session.flush()
        return True

    def _begin_write(self) -> None:
        # SQLite must begin its outer transaction before opening a savepoint.
        connection = self.session.connection()
        if (
            connection.dialect.name == "sqlite"
            and not connection.connection.driver_connection.in_transaction
        ):
            connection.exec_driver_sql("BEGIN")

    def upsert(self, record: NormalizedOpportunity) -> UpsertResult:
        """Create or update by identity; never insert a duplicate."""
        self._begin_write()
        try:
            match = self._identities().find(record, allow_update=True)
            if (
                match is not None
                and match.kind != "fingerprint"
                and match.record.source == record.source
                and self._unchanged(match.record, record)
            ):
                return "updated"  # nothing to write: skip the savepoint round trips
            with self.session.begin_nested():
                match = self._identities().find(record, allow_update=True)
                if match is not None:
                    existing = match.record
                    if match.kind == "fingerprint" or existing.source != record.source:
                        if record._requires_review:
                            self.hold_for_review(record)
                        return "duplicate"  # weak/cross-feed identity never overwrites ownership
                    self._identities().forget(existing)
                    self._apply(existing, record)
                    if not explicit_id(existing) and record.source_id:
                        existing.source_id = record.source_id
                    self.session.flush()
                    self._identities().remember(existing)
                    return "updated"  # A15 counts matched rows, including unchanged upserts
                row = Opportunity(
                    source=record.source,
                    source_id=storage_id(record),
                    is_active=self.publish and not record._requires_review,
                    **_row_values(record),
                )
                self.session.add(row)
                self.session.flush()
                self._remember(row)
                return "created"
        except IntegrityError:
            # Only the failed record's savepoint rolls back; prior successful rows survive.
            self.reset_index()
            with self.session.begin_nested():
                match = self._identities().find(record, allow_update=True)
                if match is None:
                    raise IngestionError(
                        "persistence_conflict",
                        "Database identity constraints rejected this record.",
                        review=True,
                    ) from None
                existing = match.record
                if match.kind != "fingerprint" and existing.source == record.source:
                    self._identities().forget(existing)
                    self._apply(existing, record)
                    self.session.flush()
                    self._identities().remember(existing)
                elif record._requires_review:
                    self.hold_for_review(record)
                return "duplicate"
        except Exception:
            self.reset_index()
            raise

    def _unchanged(self, row: Opportunity, record: NormalizedOpportunity) -> bool:
        """True when an upsert would write nothing (the common case on a rerun)."""
        if any(not _same(getattr(row, k), v) for k, v in _row_values(record).items()):
            return False
        if (record._requires_review and row.is_active) or self._republishable(row, record):
            return False
        return bool(explicit_id(row)) or not record.source_id

    def _apply(self, row: Opportunity, record: NormalizedOpportunity) -> bool:
        """Copy mutable fields onto ``row``. Returns True when anything changed."""
        changed = False
        values = _row_values(record)
        for field_name, value in values.items():
            previous = getattr(row, field_name)
            same = _same(previous, value)
            if not same:
                setattr(row, field_name, value)
                changed = True
        # Publication approval applies to the reviewed values, not arbitrary later changes.
        if (changed or record._requires_review) and row.is_active:
            row.is_active = False
            changed = True
        if self._republishable(row, record):
            row.is_active, row.inactive_reason = True, None
            changed = True
        if changed:
            row.updated_at = datetime.now(UTC)
        return changed

    def withdraw(self, source: str, source_id: str | None) -> bool:
        """Hide a live posting that the current scope rules now reject (publish mode)."""
        if not self.publish or not source_id:
            return False
        self._identities()  # the run's snapshot answers this without another query
        row = self._by_source[source].get(source_id)
        if row is None or not row.is_active:
            return False
        self._begin_write()
        with self.session.begin_nested():
            row.is_active = False
            row.updated_at = datetime.now(UTC)
            self.session.flush()
        return True

    def _republishable(self, row: Opportunity, record: NormalizedOpportunity) -> bool:
        """Auto-publish a seen, unambiguous posting; never revive an expired one."""
        if not self.publish or record._requires_review or row.is_active:
            return False
        expired = row.deadline is not None and utc(row.deadline) < datetime.now(UTC)
        return row.inactive_reason in (None, "source_missing") and not expired

    def commit(self) -> None:
        # Rows stay valid after commit, so the run keeps one identity snapshot.
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
        self.reset_index()
