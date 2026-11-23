"""Live owner-scoped profile collections and onboarding snapshot services."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response
from pydantic import ConfigDict, Field, ValidationError

from ..ai.client import AIInvalidOutput, AIUnavailable, OllamaClient
from ..core.config import get_settings
from ..core.errors import APIError
from ..core.storage import PrivateCVStorage
from ..schemas.profile import ProfilePatch
from ..schemas.workspace import Draft, EntryMutation, Section
from ..workspace.common import (
    entries,
    entry_json,
    finish,
    lock_user,
    owned_entry,
    previous,
    reject,
    save_entry,
    snapshot,
)
from .cv import CurrentUser, Db
from .profile import _get_or_create_skill

router = APIRouter(prefix="/workspace", tags=["workspace"])
RequestKey = Annotated[UUID, Header(alias="Idempotency-Key")]


@router.get("/capabilities")
def capabilities(user: CurrentUser):
    settings = get_settings()
    try:
        PrivateCVStorage(
            settings.supabase_url, settings.supabase_publishable_key, "validation-only"
        )
        upload = True
    except APIError:
        upload = False
    try:
        parsing = bool(settings.ollama_url) and bool(
            OllamaClient(settings.ollama_url, timeout=2).model_digest(settings.ollama_extract_model)
        )
    except (AIUnavailable, AIInvalidOutput):
        parsing = False
    return {
        "upload": upload,
        "parsing": parsing,
        "confirmation": True,
        "collections": True,
        "tailoring": True,
    }


@router.get("/snapshot")
def profile_snapshot(db: Db, user: CurrentUser):
    lock_user(db, user)
    return snapshot(db, user)


@router.get("/collections/{section}")
def list_entries(section: Section, db: Db, user: CurrentUser):
    return [entry_json(row) for row in entries(db, user, section)]


@router.post("/collections/{section}", status_code=201)
def create_entry(
    section: Section, payload: EntryMutation, db: Db, user: CurrentUser, request_id: RequestKey
):
    lock_user(db, user)
    key, hashed, old = previous(db, user, request_id, f"create:{section}", payload.model_dump())
    if old is not None:
        return old
    if payload.revision is not None:
        raise APIError("A new entry has no revision", status_code=422, code="invalid_revision")
    row = save_entry(db, user, section, payload.values)
    return finish(db, user, key, hashed, entry_json(row))


@router.patch("/collections/{section}/{entry_id}")
def update_entry(
    section: Section,
    entry_id: UUID,
    payload: EntryMutation,
    db: Db,
    user: CurrentUser,
    request_id: RequestKey,
):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, request_id, f"update:{section}:{entry_id}", payload.model_dump()
    )
    if old is not None:
        return old
    row = owned_entry(db, user, section, entry_id)
    if payload.revision != row.revision:
        reject()
    row = save_entry(db, user, section, payload.values, row)
    return finish(db, user, key, hashed, entry_json(row))


@router.delete("/collections/{section}/{entry_id}", status_code=204)
def delete_entry(
    section: Section,
    entry_id: UUID,
    db: Db,
    user: CurrentUser,
    request_id: RequestKey,
    revision: Annotated[int, Query(ge=1)],
):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, request_id, f"delete:{section}:{entry_id}", {"revision": revision}
    )
    if old is None:
        row = owned_entry(db, user, section, entry_id)
        if revision != row.revision:
            reject()
        db.delete(row)
        finish(db, user, key, hashed, {"deleted": True})
    return Response(status_code=204)


class ManualConfirmation(Draft):
    model_config = ConfigDict(extra="forbid")
    requestId: UUID
    profileRevision: str = Field(min_length=1, max_length=100)
    draft: dict


@router.post("/manual-confirm")
def manual_confirm(payload: ManualConfirmation, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "manual", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    if snapshot(db, user)["profileRevision"] != payload.profileRevision:
        reject()
    fields = {
        "degree_level",
        "university",
        "field_of_study",
        "graduation_year",
        "location",
        "skills",
    }
    if set(payload.draft) != fields:
        raise APIError(
            "Review the required onboarding fields", status_code=422, code="invalid_profile"
        )
    raw = dict(payload.draft)
    skills = raw.pop("skills")
    if (
        not isinstance(skills, list)
        or len(skills) > 100
        or any(not isinstance(s, str) or not s.strip() or len(s.strip()) > 100 for s in skills)
    ):
        raise APIError("Review the skill names", status_code=422, code="invalid_skills")
    year = raw.get("graduation_year")
    if isinstance(year, str) and year.isdigit():
        raw["graduation_year"] = int(year)
    if any(v is None or isinstance(v, str) and not v.strip() for v in raw.values()):
        raise APIError("Complete all required details", status_code=422, code="invalid_profile")
    try:
        data = ProfilePatch.model_validate(raw).model_dump(exclude_unset=True)
    except ValidationError as exc:
        raise APIError(
            "Review the profile details", status_code=422, code="invalid_profile"
        ) from exc
    for name, value in data.items():
        setattr(user.profile, name, value)
    user.skills = [_get_or_create_skill(db, s) for s in sorted({s.strip().lower() for s in skills})]
    user.profile.updated_at = datetime.now(UTC)
    db.flush()
    return finish(db, user, key, hashed, snapshot(db, user))
