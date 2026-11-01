"""C3 validation against the existing persistence/API shape, with safe diagnostics."""

from pydantic import ValidationError

from .persistence import NormalizedOpportunity
from .report import IngestionError, record_notices


def validation_error(exc: ValidationError, *, raw: bool = False) -> IngestionError:
    error = exc.errors(include_input=False, include_context=False, include_url=False)[0]
    location = error["loc"]
    field = (
        str(location[0]) if location else "identity" if error["type"] == "value_error" else "record"
    )
    known = {
        "url",
        "source",
        "source_id",
        "source_url",
        "title",
        "organization",
        "description",
        "location",
        "deadline",
        "deadline_raw",
        "posted_at",
        "degree_level",
        "degree_level_raw",
        "study_year",
        "study_year_raw",
        "opportunity_type",
        "is_active",
        "identity",
        "fetched_at",
    }
    field = field if field in known else "record"
    prefix = "invalid_raw_" if raw else "invalid_"
    return IngestionError(prefix + field, f"Record does not satisfy the {field} contract.")


def validate(value: object) -> NormalizedOpportunity:
    notices = record_notices(value)
    if isinstance(value, NormalizedOpportunity):
        value = value.model_dump()
    if not isinstance(value, dict):
        raise IngestionError(
            "invalid_record", "Normalizer must return a field mapping or normalized record."
        )
    if not value.get("url"):
        raise IngestionError(
            "missing_official_url",
            "No official URL is available; retained in the review report, not persisted.",
            review=True,
        )
    try:
        result = NormalizedOpportunity.model_validate(value)
        result._review_notices = notices
        result._requires_review = any(notice.review for notice in notices)
        return result
    except ValidationError as exc:
        raise validation_error(exc) from None
