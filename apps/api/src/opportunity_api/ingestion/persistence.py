"""Persistence: create-or-update opportunities without duplicates.

The shared deduplicator checks provider identity, canonical URL, then a
conservative fallback fingerprint. Conflicts require review rather than merging.
Repeated imports preserve row IDs and avoid duplicate rows; A15 still counts
unchanged matched upserts as updates.

``NormalizedOpportunity`` remains the existing normalize/validate contract at
this import path. New postings are inactive pending publication review.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only

from opportunity_api.models import Opportunity, OpportunityDegreeLevel, OpportunityType

from .dedupe import Deduplicator, explicit_id, storage_id, utc
from .normalize import canonical_url, clean_text
from .report import IngestionError, Notice

UpsertResult = Literal["created", "updated", "duplicate"]


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


class OpportunityStore:
    """Session-bound create/update gateway for opportunities."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._index: Deduplicator | None = None

    def reset_index(self) -> None:
        self._index = None

    def _identities(self) -> Deduplicator:
        if self._index is None:
            self._index = Deduplicator()
            # One metadata-only snapshot per source, not a full scan per incoming row.
            query = select(Opportunity).options(
                load_only(
                    Opportunity.id,
                    Opportunity.source,
                    Opportunity.source_id,
                    Opportunity.url,
                    Opportunity.title,
                    Opportunity.organization,
                    Opportunity.location,
                    Opportunity.deadline,
                    Opportunity.opportunity_type,
                )
            )
            with self.session.no_autoflush:
                for row in self.session.scalars(query):
                    self._index.remember(row)
        return self._index

    def _find(self, record: NormalizedOpportunity) -> Opportunity | None:
        match = self._identities().find(record, allow_update=True)
        return match.record if match else None

    def classify(self, record: NormalizedOpportunity) -> Literal["create", "update"]:
        """Read-only dry-run decision: would this record create or update?"""
        return "update" if self._find(record) is not None else "create"

    def opportunity_id(self, record: NormalizedOpportunity) -> str | None:
        row = self._find(record)
        return str(row.id) if row is not None else None

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
                    is_active=False,
                    **_row_values(record),
                )
                self.session.add(row)
                self.session.flush()
                self._identities().remember(row)
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

    def _apply(self, row: Opportunity, record: NormalizedOpportunity) -> bool:
        """Copy mutable fields onto ``row``. Returns True when anything changed."""
        changed = False
        values = _row_values(record)
        for field_name, value in values.items():
            previous = getattr(row, field_name)
            same = (
                utc(previous) == utc(value)
                if isinstance(previous, datetime) and isinstance(value, datetime)
                else previous == value
            )
            if not same:
                setattr(row, field_name, value)
                changed = True
        # Publication approval applies to the reviewed values, not arbitrary later changes.
        if (changed or record._requires_review) and row.is_active:
            row.is_active = False
            changed = True
        if changed:
            row.updated_at = datetime.now(UTC)
        return changed

    def commit(self) -> None:
        self.session.commit()
        self.reset_index()

    def rollback(self) -> None:
        self.session.rollback()
        self.reset_index()
