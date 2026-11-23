"""Active private PDF and atomic, explicitly reviewed profile import adapters."""

import hashlib
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from ..ai.client import AIInvalidOutput, AIUnavailable
from ..ai.documents import PDF
from ..ai.schemas import CVExtraction
from ..core.config import get_settings
from ..core.errors import APIError
from ..models import CVDocument, Profile, ResumeState
from ..schemas.profile import ProfilePatch
from ..schemas.workspace import ReviewChanges, SourceRequest
from ..workspace.common import (
    PROFILE_FIELDS,
    finish,
    iso,
    lock_user,
    new_record,
    owned_entry,
    owned_record,
    previous,
    reject,
    review_values,
    save_entry,
    snapshot,
)
from .cv import CurrentUser, Db, Model, Storage, profile_values, read_document, stage_cv
from .profile import _get_or_create_skill
from .workspace import RequestKey

router = APIRouter(prefix="/workspace/resume", tags=["resume"])


def active_resume(db, user):
    state = db.get(ResumeState, user.id)
    doc = (
        db.scalar(
            select(CVDocument).where(
                CVDocument.id == state.document_id, CVDocument.user_id == user.id
            )
        )
        if state and state.document_id
        else None
    )
    return state, doc


def metadata(state, document):
    return {
        "id": str(document.id),
        "revision": state.revision,
        "fileName": "resume.pdf",
        "sizeBytes": document.size_bytes,
        "contentType": PDF,
        "uploadedAt": iso(document.created_at),
    }


def require_source(db, user, source):
    state, doc = active_resume(db, user)
    if not doc or str(doc.id) != source.id or state.revision != source.revision:
        reject("Your active PDF changed. Reload before continuing.", code="resume_changed")
    return state, doc


@router.get("")
def load_resume(db: Db, user: CurrentUser):
    state, doc = active_resume(db, user)
    return metadata(state, doc) if doc else None


@router.post("", status_code=201)
async def upload_resume(
    request: Request,
    db: Db,
    user: CurrentUser,
    storage: Storage,
    request_id: RequestKey,
    replace_id: UUID | None = None,
    replace_revision: Annotated[int | None, Query(ge=1)] = None,
):
    lock_user(db, user)
    state, existing = active_resume(db, user)
    # The same request key is reusable only for the same bytes and replacement intent.
    declared = request.headers.get("content-length")
    if declared and (not declared.isdigit() or int(declared) > 5 * 1024 * 1024):
        raise APIError("PDF exceeds 5 MiB", status_code=413, code="file_too_large")
    # stage_cv streams with an independent bound and validates the actual PDF.
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 5 * 1024 * 1024:
            raise APIError("PDF exceeds 5 MiB", status_code=413, code="file_too_large")
        body.extend(chunk)
    key, hashed, old = previous(
        db,
        user,
        request_id,
        "resume-upload",
        {
            "sha256": hashlib.sha256(body).hexdigest(),
            "replace_id": str(replace_id),
            "replace_revision": replace_revision,
        },
    )
    if old is not None:
        return old
    if (
        (existing is not None) != (replace_id is not None)
        or existing
        and (existing.id != replace_id or state.revision != replace_revision)
        or replace_id is None
        and replace_revision is not None
    ):
        reject("The saved PDF changed. Reload before replacing it.", code="resume_changed")

    # A new Request replays only the already-bounded body, never a second network stream.
    async def receive():
        return {"type": "http.request", "body": bytes(body), "more_body": False}

    replay = Request(request.scope, receive)
    document = await stage_cv(replay, db, user, storage, "resume.pdf")
    try:
        if state is None:
            state = ResumeState(user_id=user.id, document_id=document.id)
            db.add(state)
        else:
            state.document_id = document.id
        db.flush()
        return finish(db, user, key, hashed, metadata(state, document))
    except Exception:
        db.rollback()
        try:
            await run_in_threadpool(storage.delete, document.storage_path)
        except APIError:
            pass
        raise


@router.get("/{document_id}/file")
def access_resume(
    document_id: UUID,
    db: Db,
    user: CurrentUser,
    storage: Storage,
    revision: Annotated[int, Query(ge=1)],
):
    from ..schemas.workspace import Identity

    _, doc = require_source(db, user, Identity(id=str(document_id), revision=revision))
    return Response(
        storage.download(doc.storage_path),
        media_type=PDF,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'inline; filename="resume.pdf"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{document_id}", status_code=204)
def remove_resume(
    document_id: UUID,
    db: Db,
    user: CurrentUser,
    storage: Storage,
    request_id: RequestKey,
    revision: Annotated[int, Query(ge=1)],
):
    from ..schemas.workspace import Identity

    lock_user(db, user)
    key, hashed, old = previous(
        db, user, request_id, "resume-delete", {"id": str(document_id), "revision": revision}
    )
    if old is None:
        state, doc = require_source(db, user, Identity(id=str(document_id), revision=revision))
        storage.delete(doc.storage_path)
        state.document_id = None
        db.flush()
        db.delete(doc)
        finish(db, user, key, hashed, {"deleted": True})
    return Response(status_code=204)


def parsing_job(row):
    return {
        "id": str(row.id),
        "source": row.payload["source"],
        "profileRevision": row.payload["result"]["snapshot"]["profileRevision"],
        "status": "ready",
    }


@router.post("/review/start")
def start_review(
    payload: SourceRequest,
    db: Db,
    user: CurrentUser,
    storage: Storage,
    model: Model,
    request_id: RequestKey,
):
    lock_user(db, user)
    key, hashed, old = previous(db, user, request_id, "review-start", payload.model_dump())
    if old is not None:
        return old
    _, doc = require_source(db, user, payload.source)
    source = payload.source.model_dump()
    before = snapshot(db, user)
    data = storage.download(doc.storage_path)
    if hashlib.sha256(data).hexdigest() != doc.sha256:
        reject("The stored PDF changed. Upload it again.", code="resume_changed")
    text = read_document(data, doc.media_type)
    try:
        extraction = model.generate(get_settings().ollama_extract_model, text, CVExtraction)
        extraction.verify_evidence(text)
    except AIUnavailable as exc:
        raise APIError(
            "Extraction is offline. Your PDF is saved; complete manually or retry.",
            status_code=503,
            code="ai_unavailable",
        ) from exc
    except (AIInvalidOutput, ValueError) as exc:
        raise APIError(
            "The extracted draft could not be validated. Complete manually or retry.",
            status_code=422,
            code="invalid_extraction",
        ) from exc
    doc.extraction = extraction.model_dump(mode="json")
    doc.extraction_model = get_settings().ollama_extract_model
    doc.profile_snapshot = profile_values(user)
    doc.status = "extracted"
    proposed = {
        name: str(extraction.values_for(name))
        for name in PROFILE_FIELDS
        if name in CVExtraction.model_fields and extraction.values_for(name) is not None
    }
    result = {
        "source": source,
        "snapshot": before,
        "proposed": {
            "profile": proposed,
            "skills": extraction.values_for("skills"),
            "collections": [],
        },
        "warnings": [
            "Only explicit core profile facts and skills were extracted. "
            "Review every value; add other profile sections manually."
        ],
    }
    record_id = uuid4()
    result["jobId"] = str(record_id)
    row = new_record(db, user, "parse", {"source": source, "result": result}, record_id)
    return finish(db, user, key, hashed, parsing_job(row))


@router.get("/review/{job_id}")
def review_status(job_id: UUID, db: Db, user: CurrentUser):
    row = owned_record(db, user, job_id, "parse")
    from ..schemas.workspace import Identity

    require_source(db, user, Identity.model_validate(row.payload["source"]))
    return parsing_job(row)


@router.get("/review/{job_id}/result")
def review_result(job_id: UUID, db: Db, user: CurrentUser):
    row = owned_record(db, user, job_id, "parse")
    from ..schemas.workspace import Identity

    require_source(db, user, Identity.model_validate(row.payload["source"]))
    return row.payload["result"]


@router.post("/review/confirm")
def confirm_review(payload: ReviewChanges, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "review-confirm", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    _, doc = require_source(db, user, payload.source)
    row = owned_record(db, user, payload.jobId, "parse")
    result = row.payload["result"]
    if row.payload["source"] != payload.source.model_dump():
        reject("This draft belongs to a different PDF", code="resume_changed")
    # Lock the actual profile as well as the owner's workflow writes.
    db.scalar(
        select(Profile)
        .where(Profile.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        payload.profileRevision != result["snapshot"]["profileRevision"]
        or snapshot(db, user)["profileRevision"] != payload.profileRevision
    ):
        reject("Your saved profile changed. Parse again before accepting this draft.")
    if set(payload.profile) - set(PROFILE_FIELDS) or set(payload.skills) != {"add"}:
        raise APIError("Invalid review fields", status_code=422, code="invalid_review")
    skills = payload.skills["add"]
    if (
        not isinstance(skills, list)
        or len(skills) > 100
        or any(not isinstance(s, str) or not s.strip() or len(s.strip()) > 100 for s in skills)
    ):
        raise APIError("Review the skill names", status_code=422, code="invalid_skills")
    try:
        patch = ProfilePatch.model_validate(payload.profile).model_dump(exclude_unset=True)
    except ValidationError as exc:
        raise APIError(
            "Review the profile fields", status_code=422, code="invalid_profile"
        ) from exc
    if not patch and not skills and not payload.collections:
        raise APIError("Select at least one change", status_code=422, code="empty_review")
    provenance = dict(doc.provenance or {})
    for name, value in patch.items():
        setattr(user.profile, name, value)
        extracted = doc.extraction.get(name) if doc.extraction else None
        provenance[name] = (
            {"origin": "model-reviewed", "fact": extracted, "model": doc.extraction_model}
            if extracted and str(extracted["value"]) == str(value)
            else {"origin": "user-review"}
        )
    current_skills = {s.name: s for s in user.skills}
    for name in sorted({s.strip().lower() for s in skills}):
        current_skills.setdefault(name, _get_or_create_skill(db, name))
    user.skills = list(current_skills.values())
    for change in payload.collections:
        if (
            set(change) - {"section", "proposalKey", "operation", "target", "fields"}
            or not isinstance(change.get("section"), str)
            or change.get("section") not in result["snapshot"]["collections"]
            or not isinstance(change.get("operation"), str)
            or change.get("operation") not in {"add", "update"}
            or not isinstance(change.get("fields"), dict)
            or not change["fields"]
        ):
            raise APIError("Invalid collection review", status_code=422, code="invalid_review")
        section = change["section"]
        if change["operation"] == "update":
            target = change.get("target") or {}
            if not isinstance(target, dict):
                raise APIError(
                    "Choose an exact saved entry", status_code=422, code="invalid_review"
                )
            try:
                entry_id = UUID(target.get("id", ""))
            except (ValueError, TypeError) as exc:
                raise APIError(
                    "Choose an exact saved entry", status_code=422, code="invalid_review"
                ) from exc
            entry = owned_entry(db, user, section, entry_id)
            if entry.revision != target.get("revision"):
                reject()
            values = {**review_values(section, entry.values), **change["fields"]}
        else:
            entry, values = None, change["fields"]
        save_entry(db, user, section, values, entry)
    db.flush()
    doc.status = "reviewed"
    doc.provenance = provenance
    from datetime import UTC, datetime

    doc.reviewed_at = datetime.now(UTC)
    user.profile.updated_at = datetime.now(UTC)
    db.flush()
    receipt = {
        "requestId": payload.requestId,
        "jobId": payload.jobId,
        "source": payload.source.model_dump(),
        "snapshot": snapshot(db, user),
    }
    return finish(db, user, key, hashed, receipt)
