"""Ownership, snapshots, optimistic versions and durable idempotency receipts."""

import hashlib
import json
from datetime import UTC
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from ..core.errors import APIError
from ..models import ProfileEntry, ResumeState, User, WorkspaceRecord
from ..schemas.workspace import DRAFTS, SECTIONS

PROFILE_FIELDS = (
    "headline",
    "bio",
    "degree_level",
    "university",
    "field_of_study",
    "graduation_year",
    "location",
)


def reject(
    message="Your saved data changed. Reload before retrying.", *, code="workspace_conflict"
):
    raise APIError(message, status_code=409, code=code)


def lock_user(db, user):
    db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    db.expire(user, ["profile", "skills"])


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def iso(value):
    return (
        value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    ).isoformat()


def entry_json(entry):
    return {
        **entry.values,
        "id": str(entry.id),
        "revision": entry.revision,
        "position": entry.position,
    }


def review_values(section, values):
    result = dict(values)
    for key in ("achievements", "authors"):
        if isinstance(result.get(key), list):
            result[key] = "\n".join(result[key])
    return result


def validate_entry(section, values):
    try:
        data = DRAFTS[section].model_validate(values).model_dump()
    except (ValidationError, KeyError, TypeError) as exc:
        raise APIError(
            "Review the entry's fields, dates and links", status_code=422, code="invalid_entry"
        ) from exc
    for key in ("achievements", "authors"):
        if key in data:
            data[key] = [s.strip() for s in data[key].splitlines() if s.strip()]
    return data


def entries(db, user, section=None):
    query = select(ProfileEntry).where(ProfileEntry.user_id == user.id)
    if section:
        query = query.where(ProfileEntry.section == section)
    return list(
        db.scalars(query.order_by(ProfileEntry.section, ProfileEntry.position, ProfileEntry.id))
    )


def owned_entry(db, user, section, entry_id):
    row = db.scalar(
        select(ProfileEntry).where(
            ProfileEntry.user_id == user.id,
            ProfileEntry.section == section,
            ProfileEntry.id == entry_id,
        )
    )
    if row is None:
        raise APIError("Entry not found", status_code=404, code="entry_not_found")
    return row


def save_entry(db, user, section, values, entry=None):
    data = validate_entry(section, values)
    normalized = data["name"].casefold() if section == "languages" else None
    existing = entries(db, user, section)
    if normalized and any(
        row.id != (entry.id if entry else None) and row.normalized_name == normalized
        for row in existing
    ):
        reject("This language is already listed", code="duplicate_language")
    if entry is None:
        if len(existing) >= 100:
            raise APIError(
                "Use at most 100 entries per section", status_code=422, code="entry_limit"
            )
        entry = ProfileEntry(
            user_id=user.id,
            section=section,
            position=max((row.position for row in existing), default=0) + 1,
        )
        db.add(entry)
    if entry.revision is not None:
        entry.revision += 1
    entry.values, entry.normalized_name = data, normalized
    db.flush()
    return entry


def snapshot(db, user):
    profile = {key: str(getattr(user.profile, key) or "") for key in PROFILE_FIELDS}
    skills = sorted(s.name for s in user.skills)
    collections = {section: [] for section in SECTIONS}
    for row in entries(db, user):
        collections[row.section].append(
            {
                "id": str(row.id),
                "revision": row.revision,
                "position": row.position,
                "values": review_values(row.section, row.values),
            }
        )
    state = db.get(ResumeState, user.id)
    payload = {"profile": profile, "skills": skills, "collections": collections}
    revision = digest(
        {
            **payload,
            "profile_updated_at": iso(user.profile.updated_at),
            "identity": user.full_name,
            "resume": (str(state.document_id), state.revision) if state else None,
        }
    )
    return {"profileRevision": revision, **payload}


def owned_record(db, user, record_id, kind):
    try:
        key = UUID(str(record_id))
    except ValueError:
        key = None
    row = (
        db.scalar(
            select(WorkspaceRecord).where(
                WorkspaceRecord.user_id == user.id,
                WorkspaceRecord.id == key,
                WorkspaceRecord.kind == kind,
            )
        )
        if key
        else None
    )
    if row is None:
        raise APIError("Record not found", status_code=404, code="workflow_not_found")
    return row


def previous(db, user, request_id, scope, payload):
    try:
        key = UUID(str(request_id))
    except ValueError as exc:
        raise APIError(
            "A UUID request identifier is required", status_code=422, code="invalid_request_id"
        ) from exc
    expected = digest({"scope": scope, "payload": payload})
    row = db.scalar(
        select(WorkspaceRecord).where(
            WorkspaceRecord.user_id == user.id, WorkspaceRecord.request_key == key
        )
    )
    if row:
        if row.request_hash != expected:
            reject("Request identifier was already used for different changes")
        return key, expected, row.payload["response"]
    return key, expected, None


def finish(db, user, key, request_hash, response):
    db.add(
        WorkspaceRecord(
            user_id=user.id,
            kind="operation",
            request_key=key,
            request_hash=request_hash,
            payload={"response": response},
        )
    )
    try:
        db.commit()
    except (IntegrityError, StaleDataError) as exc:
        db.rollback()
        raise APIError(
            "Saved data changed. Reload and retry.", status_code=409, code="workspace_conflict"
        ) from exc
    return response


def new_record(db, user, kind, payload, record_id=None):
    row = WorkspaceRecord(id=record_id or uuid4(), user_id=user.id, kind=kind, payload=payload)
    db.add(row)
    db.flush()
    return row
