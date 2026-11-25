"""ATS check, tailored CV and cover letter (LaTeX compiled to PDF) for one job."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..documents import content, latex
from .cv import CurrentUser, Db
from .opportunities import _get_opportunity_or_404, _to_matching_opportunity, _to_matching_profile

router = APIRouter(prefix="/workspace", tags=["documents"])

Keyword = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class Keywords(BaseModel):
    model_config = ConfigDict(extra="forbid")
    keywords: list[Keyword] = Field(default_factory=list, max_length=30)


@router.post("/ats/{job_id}", response_model=content.AtsReport)
def ats_check(job_id: UUID, payload: Keywords, db: Db, user: CurrentUser) -> content.AtsReport:
    opportunity = _get_opportunity_or_404(db, job_id)
    return content.ats_report(
        content.load_candidate(db, user),
        _to_matching_profile(user, db),
        _to_matching_opportunity(opportunity),
        payload.keywords,
    )


@router.post("/documents/{job_id}/{kind}")
def tailored_pdf(
    job_id: UUID,
    kind: Literal["resume", "cover-letter"],
    payload: Keywords,
    db: Db,
    user: CurrentUser,
) -> Response:
    opportunity = _get_opportunity_or_404(db, job_id)
    args = (
        content.load_candidate(db, user),
        _to_matching_opportunity(opportunity),
        opportunity.organization or "",
        payload.keywords,
        _to_matching_profile(user, db),
    )
    if kind == "resume":
        doc, by_model = content.resume_document(*args)
        source = latex.resume_source(doc)
    else:
        doc, by_model = content.letter_document(*args)
        source = latex.letter_source(doc)
    return Response(
        latex.compile_pdf(source),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{kind}.pdf"',
            "Cache-Control": "private, no-store",
            "X-Written-By": "model" if by_model else "profile",
        },
    )
