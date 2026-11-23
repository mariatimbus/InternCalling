"""Owner-scoped CV uploads and reviewed extraction. No automatic profile writes."""

import hashlib
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..ai.client import AIInvalidOutput, AIUnavailable, OllamaClient
from ..ai.documents import DOCX, MAX_FILE_BYTES, PDF, InvalidDocument, extract_text
from ..ai.schemas import CVExtraction
from ..core.config import get_settings
from ..core.database import get_db
from ..core.errors import APIError
from ..core.storage import PrivateCVStorage
from ..models import CVDocument, Profile, User
from ..schemas.cv import CVResponse, CVReview
from ..workspace.common import lock_user
from .deps import bearer_scheme, get_current_user
from .profile import _get_or_create_skill

router = APIRouter(prefix="/cv", tags=["cv"])
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def get_storage(creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]):
    if creds is None:
        raise APIError("Not authenticated", status_code=401, code="unauthorized")
    settings = get_settings()
    return PrivateCVStorage(
        settings.supabase_url, settings.supabase_publishable_key, creds.credentials
    )


def get_model():
    settings = get_settings()
    try:
        return OllamaClient(settings.ollama_url, timeout=settings.ollama_timeout)
    except AIUnavailable as exc:
        raise APIError(
            "CV extraction is unavailable", status_code=503, code="ai_unavailable"
        ) from exc


Storage = Annotated[PrivateCVStorage, Depends(get_storage)]
Model = Annotated[OllamaClient, Depends(get_model)]


def owned(db: Session, user: User, document_id: UUID, *, lock=False) -> CVDocument:
    stmt = select(CVDocument).where(CVDocument.id == document_id, CVDocument.user_id == user.id)
    if lock:
        stmt = stmt.with_for_update()
    document = db.scalar(stmt)
    if document is None:
        raise APIError("CV not found", status_code=404, code="cv_not_found")
    return document


def read_document(data: bytes, media_type: str):
    try:
        return extract_text(data, media_type)
    except InvalidDocument as exc:
        raise APIError(str(exc), status_code=422, code="invalid_document") from exc


def profile_values(user: User):
    result = {
        name: getattr(user.profile, name) for name in CVExtraction.model_fields if name != "skills"
    }
    result["skills"] = sorted(skill.name for skill in user.skills)
    return result


@router.get("/service-health")
def model_health(user: CurrentUser):
    settings = get_settings()
    try:
        available = OllamaClient(settings.ollama_url, timeout=2).healthy()
    except AIUnavailable:
        available = False
    return {"configured": bool(settings.ollama_url), "available": available}


@router.get("", response_model=list[CVResponse])
def list_cvs(db: Db, user: CurrentUser):
    return list(
        db.scalars(
            select(CVDocument)
            .where(CVDocument.user_id == user.id)
            .order_by(CVDocument.created_at.desc(), CVDocument.id)
        )
    )


async def stage_cv(request, db, user, storage, filename):
    # Fail before writing an object if the metadata migration is missing.
    db.scalar(select(CVDocument.id).where(CVDocument.user_id == user.id).limit(1))
    media_type = request.headers.get("content-type", "").split(";")[0].strip()
    expected = PDF if filename.endswith(".pdf") else DOCX
    if media_type != expected:
        raise APIError(
            "Use a matching PDF or DOCX content type",
            status_code=415,
            code="unsupported_media_type",
        )
    data = bytearray()
    async for chunk in request.stream():
        if len(chunk) > MAX_FILE_BYTES - len(data):
            raise APIError("CV exceeds 5 MiB", status_code=413, code="file_too_large")
        data.extend(chunk)
    content = bytes(data)
    await run_in_threadpool(read_document, content, media_type)
    document_id = uuid4()
    path = f"{user.id}/{document_id}/resume.{filename.rsplit('.', 1)[1]}"
    await run_in_threadpool(storage.upload, path, content, media_type)
    document = CVDocument(
        id=document_id,
        user_id=user.id,
        storage_path=path,
        media_type=media_type,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(document)
    return document


@router.post("", response_model=CVResponse, status_code=201)
async def upload_cv(
    request: Request,
    db: Db,
    user: CurrentUser,
    storage: Storage,
    filename: Annotated[str, Query(pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,180}\.(pdf|docx)$")],
):
    document = await stage_cv(request, db, user, storage, filename)
    path = document.storage_path
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            await run_in_threadpool(storage.delete, path)
        except APIError:
            pass  # A private orphan can be reconciled; do not log personal data or credentials.
        raise APIError(
            "CV metadata could not be saved", status_code=503, code="cv_save_failed"
        ) from exc
    return document


@router.get("/{document_id}", response_model=CVResponse)
def get_cv(document_id: UUID, db: Db, user: CurrentUser):
    return owned(db, user, document_id)


@router.get("/{document_id}/file")
def download_cv(document_id: UUID, db: Db, user: CurrentUser, storage: Storage):
    document = owned(db, user, document_id)
    suffix = "pdf" if document.media_type == PDF else "docx"
    return Response(
        storage.download(document.storage_path),
        media_type=document.media_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="resume.{suffix}"',
        },
    )


@router.post("/{document_id}/extract", response_model=CVResponse)
def extract_cv(document_id: UUID, db: Db, user: CurrentUser, storage: Storage, model: Model):
    lock_user(db, user)
    document = owned(db, user, document_id, lock=True)
    content = storage.download(document.storage_path)
    if hashlib.sha256(content).hexdigest() != document.sha256:
        raise APIError("CV content changed; upload it again", status_code=409, code="cv_changed")
    text = read_document(content, document.media_type)
    try:
        extraction = model.generate(get_settings().ollama_extract_model, text, CVExtraction)
        extraction.verify_evidence(text)
    except AIUnavailable as exc:
        raise APIError(
            "CV extraction is unavailable; your file is still saved",
            status_code=503,
            code="ai_unavailable",
        ) from exc
    except (AIInvalidOutput, ValueError) as exc:
        raise APIError(
            "Extraction could not be validated; edit your profile manually or try again",
            status_code=422,
            code="invalid_extraction",
        ) from exc
    document.extraction = extraction.model_dump(mode="json")
    document.extraction_model = get_settings().ollama_extract_model
    document.profile_snapshot = profile_values(user)
    document.status = "extracted"
    db.commit()
    return document


@router.post("/{document_id}/review", response_model=CVResponse)
def review_cv(document_id: UUID, payload: CVReview, db: Db, user: CurrentUser):
    lock_user(db, user)
    document = owned(db, user, document_id, lock=True)
    if document.status != "extracted" or not document.extraction:
        raise APIError("Extract this CV before reviewing it", status_code=409, code="cv_not_ready")
    db.scalar(
        select(Profile)
        .where(Profile.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    extraction = CVExtraction.model_validate(document.extraction)
    current = profile_values(user)
    provenance = dict(document.provenance or {})
    for name in set(payload.fields):
        value = extraction.values_for(name)
        if value is None or (isinstance(value, list) and not value):
            raise APIError(
                "Only extracted facts can be accepted", status_code=422, code="missing_fact"
            )
        if current[name] != (document.profile_snapshot or {}).get(name):
            raise APIError(
                "Your profile changed since extraction; extract again before accepting",
                status_code=409,
                code="profile_changed",
            )
        provenance[name] = {"fact": document.extraction[name], "model": document.extraction_model}
    for name in set(payload.fields):
        value = extraction.values_for(name)
        if name == "skills":
            user.skills = [
                _get_or_create_skill(db, item)
                for item in sorted(set(v.strip().lower() for v in value))
            ]
        else:
            setattr(user.profile, name, value)
    document.provenance = provenance
    document.reviewed_at = datetime.now(UTC)
    document.status = "reviewed"
    db.commit()
    return document


@router.delete("/{document_id}", status_code=204)
def delete_cv(document_id: UUID, db: Db, user: CurrentUser, storage: Storage):
    lock_user(db, user)
    document = owned(db, user, document_id, lock=True)
    storage.delete(document.storage_path)
    db.delete(document)
    db.commit()
    return Response(status_code=204)
