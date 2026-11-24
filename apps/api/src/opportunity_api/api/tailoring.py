"""Durable source-based drafts, explicit approvals and approved-content PDF export."""

from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from ..core.errors import APIError
from ..schemas.workspace import Draft
from ..workspace.common import finish, lock_user, new_record, owned_record, previous, reject
from ..workspace.pdf import render_approved_pdf
from ..workspace.tailoring import context, draft_json, require_scope, validate_blocks
from .cv import CurrentUser, Db

router = APIRouter(prefix="/workspace/tailoring", tags=["tailoring"])


class Generate(Draft):
    model_config = ConfigDict(extra="forbid")
    requestId: UUID
    scope: dict


class DraftChange(Draft):
    model_config = ConfigDict(extra="forbid")
    requestId: UUID
    draft: dict
    blocks: list[dict] | None = Field(default=None, max_length=100)


class ExportRequest(Draft):
    model_config = ConfigDict(extra="forbid")
    requestId: UUID
    approval: dict


def current_draft(db, user, ref):
    row = owned_record(db, user, ref.get("id"), "tailor-draft")
    if str(row.revision) != ref.get("revision"):
        reject("This tailored draft changed", code="tailoring_conflict")
    value = require_scope(db, user, row.payload["scope"])
    return row, value


@router.get("/context/{job_id}")
def load_context(job_id: UUID, db: Db, user: CurrentUser):
    lock_user(db, user)
    return context(db, user, job_id)


@router.post("/generate")
def generate(payload: Generate, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "tailor-generate", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    value = require_scope(db, user, payload.scope)
    facts = value["source"]["facts"]
    if not facts:
        raise APIError(
            "Add profile facts before preparing a resume", status_code=422, code="empty_profile"
        )
    blocks = [
        {
            "id": "source:" + fact["id"],
            "section": fact["section"],
            "title": fact["title"],
            "text": fact["text"],
            "sourceRefs": [{"id": fact["id"], "revision": fact["revision"]}],
            "origin": "source",
            "wording": "source",
            "decision": "pending",
        }
        for fact in facts
    ]
    corpus = "\n".join(fact["text"] for fact in facts).casefold()
    missing = []
    import re

    for requirement in value["job"]["requirements"]:
        if not re.search(
            r"(?<!\w)" + re.escape(requirement["text"].casefold()) + r"(?!\w)", corpus
        ):
            missing.append(requirement["id"])
    row = new_record(
        db,
        user,
        "tailor-draft",
        {
            "scope": payload.scope,
            "blocks": blocks,
            "missingRequirements": missing,
            "warnings": [
                "This draft reorders saved source facts; no AI rewriting or "
                "invented qualifications were used.",
                "At most 100 source fragments are included. "
                "Review coverage and every item before approval.",
            ],
        },
    )
    response = {
        "id": str(row.id),
        "scope": payload.scope,
        "status": "ready",
        "draft": draft_json(row),
    }
    return finish(db, user, key, hashed, response)


@router.get("/generation/{generation_id}")
def generation_status(generation_id: UUID, db: Db, user: CurrentUser):
    row = owned_record(db, user, generation_id, "tailor-draft")
    require_scope(db, user, row.payload["scope"])
    return {
        "id": str(row.id),
        "scope": row.payload["scope"],
        "status": "ready",
        "draft": draft_json(row),
    }


@router.post("/save")
def save(payload: DraftChange, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "tailor-save", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    row, value = current_draft(db, user, payload.draft)
    validate_blocks(payload.blocks, value)
    row.payload = {**row.payload, "blocks": payload.blocks}
    row.revision += 1
    db.flush()
    return finish(db, user, key, hashed, draft_json(row))


@router.post("/approve")
def approve(payload: DraftChange, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "tailor-approve", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    row, value = current_draft(db, user, payload.draft)
    if payload.blocks is not None:
        raise APIError(
            "Save edited wording before approval", status_code=422, code="invalid_approval"
        )
    validate_blocks(row.payload["blocks"], value)
    decisions = [block["decision"] for block in row.payload["blocks"]]
    if "accepted" not in decisions or "pending" in decisions:
        raise APIError(
            "Accept or exclude every item before approval", status_code=422, code="unreviewed_items"
        )
    approval = new_record(
        db, user, "tailor-approval", {"draft": payload.draft, "scope": row.payload["scope"]}
    )
    return finish(db, user, key, hashed, {"id": str(approval.id), **approval.payload})


def verified_export(db, user, export_id):
    row = owned_record(db, user, export_id, "tailor-export")
    current_draft(db, user, row.payload["draft"])
    return row


def export_json(row):
    return {
        "id": str(row.id),
        "approvalId": row.payload["approvalId"],
        "draft": row.payload["draft"],
        "status": "ready",
    }


@router.post("/export")
def export_pdf(payload: ExportRequest, db: Db, user: CurrentUser):
    lock_user(db, user)
    key, hashed, old = previous(
        db, user, payload.requestId, "tailor-export", payload.model_dump(mode="json")
    )
    if old is not None:
        return old
    approval = owned_record(db, user, payload.approval.get("id"), "tailor-approval")
    if payload.approval != {"id": str(approval.id), **approval.payload}:
        reject("Approval no longer matches the selected draft", code="tailoring_conflict")
    row, _ = current_draft(db, user, approval.payload["draft"])
    # Render before recording readiness: unsupported or oversized content is never labelled ready.
    render_approved_pdf(row.payload["blocks"])
    job = new_record(
        db,
        user,
        "tailor-export",
        {
            "approvalId": str(approval.id),
            "draft": approval.payload["draft"],
            "blocks": row.payload["blocks"],
        },
    )
    return finish(db, user, key, hashed, export_json(job))


@router.get("/export/{export_id}")
def export_status(export_id: UUID, db: Db, user: CurrentUser):
    return export_json(verified_export(db, user, export_id))


@router.get("/export/{export_id}/file")
def export_file(export_id: UUID, db: Db, user: CurrentUser):
    lock_user(db, user)
    row = verified_export(db, user, export_id)
    return Response(
        render_approved_pdf(row.payload["blocks"]),
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'attachment; filename="approved-resume.pdf"',
            "X-Content-Type-Options": "nosniff",
        },
    )
