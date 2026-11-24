"""Reviewer queue for ingested postings the scope rules could not decide alone."""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.errors import APIError
from ..ingestion.dedupe import utc
from ..models import Opportunity, User
from .deps import require_reviewer

router = APIRouter(prefix="/review", tags=["review"])

Db = Annotated[Session, Depends(get_db)]
Reviewer = Annotated[User, Depends(require_reviewer)]
QUEUE_LIMIT = 100


class ReviewItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    organization: str | None
    location: str | None
    url: str
    description: str | None
    source: str
    posted_at: datetime | None
    deadline: datetime | None
    review_reason: str | None


class ReviewQueue(BaseModel):
    items: list[ReviewItem]
    total: int


class ReviewDecision(BaseModel):
    decision: Literal["approve", "reject"]


PENDING = Opportunity.review_status == "pending"


@router.get("/opportunities", response_model=ReviewQueue)
def review_queue(db: Db, _: Reviewer) -> ReviewQueue:
    items = db.scalars(
        select(Opportunity)
        .where(PENDING)
        .order_by(Opportunity.posted_at.desc().nullslast(), Opportunity.id)
        .limit(QUEUE_LIMIT)
    ).all()
    total = db.scalar(select(func.count()).select_from(Opportunity).where(PENDING))
    return ReviewQueue(items=items, total=total)


@router.post("/opportunities/{opportunity_id}", status_code=status.HTTP_204_NO_CONTENT)
def decide(opportunity_id: UUID, body: ReviewDecision, db: Db, _: Reviewer) -> Response:
    row = db.scalar(select(Opportunity).where(Opportunity.id == opportunity_id).with_for_update())
    if row is None or row.review_status != "pending":
        # Already decided in another tab, or the next ingestion run took it off the queue.
        raise APIError("Posting is not waiting for review", status_code=409, code="conflict")
    now = datetime.now(UTC)
    row.review_status = "approved" if body.decision == "approve" else "rejected"
    row.reviewed_at = row.updated_at = now
    if body.decision == "approve":
        expired = row.deadline is not None and utc(row.deadline) < now
        row.is_active = not expired
        row.inactive_reason = "deadline_expired" if expired else None
    else:
        row.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
