"""Saved Jobs searches, optionally emailed daily as alerts. 🔒 authenticated.

Every query is scoped to the current user; another user's search is
indistinguishable from a missing one (404), mirroring the Supabase RLS policy.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.errors import APIError
from ..models import SavedSearch, User
from .deps import get_current_user

router = APIRouter(prefix="/saved-searches", tags=["saved-searches"])

Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
MAX_SEARCHES = 10


def _blank(value: str | None) -> str | None:
    return value.strip() or None if isinstance(value, str) else value


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    search: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=255)
    degree_level: Literal["bachelor", "master", "both"] | None = None
    study_year: int | None = Field(default=None, ge=1, le=6)
    alert: bool = False

    _strip = field_validator("name", "search", "location", mode="before")(_blank)


class SavedSearchUpdate(BaseModel):
    alert: bool


class SavedSearchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    search: str | None
    location: str | None
    degree_level: str | None
    study_year: int | None
    alert: bool
    created_at: datetime


class SavedSearchList(BaseModel):
    items: list[SavedSearchResponse]


def _owned(db: Session, user: User, search_id: UUID) -> SavedSearch:
    row = db.scalar(
        select(SavedSearch).where(SavedSearch.id == search_id, SavedSearch.user_id == user.id)
    )
    if row is None:
        raise APIError("Saved search not found", status_code=404, code="not_found")
    return row


@router.get("", response_model=SavedSearchList)
def list_saved_searches(db: Db, user: CurrentUser) -> SavedSearchList:
    rows = db.scalars(
        select(SavedSearch).where(SavedSearch.user_id == user.id).order_by(SavedSearch.created_at)
    ).all()
    return SavedSearchList(items=rows)


@router.post("", response_model=SavedSearchResponse, status_code=status.HTTP_201_CREATED)
def create_saved_search(body: SavedSearchCreate, db: Db, user: CurrentUser) -> SavedSearch:
    if not (body.search or body.location or body.degree_level or body.study_year):
        raise APIError(
            "Search for something before saving it.", status_code=422, code="validation_error"
        )
    owned = select(func.count()).select_from(SavedSearch).where(SavedSearch.user_id == user.id)
    if db.scalar(owned) >= MAX_SEARCHES:
        raise APIError(
            f"You can keep up to {MAX_SEARCHES} saved searches.",
            status_code=409,
            code="limit_reached",
        )
    duplicate = select(SavedSearch).where(
        SavedSearch.user_id == user.id, func.lower(SavedSearch.name) == body.name.lower()
    )
    if db.scalar(duplicate) is not None:
        raise APIError("A saved search already has this name.", status_code=409, code="conflict")
    # Alerts only cover postings that appear after the search is saved.
    row = SavedSearch(user_id=user.id, last_alerted_at=datetime.now(UTC), **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{search_id}", response_model=SavedSearchResponse)
def update_saved_search(
    search_id: UUID, body: SavedSearchUpdate, db: Db, user: CurrentUser
) -> SavedSearch:
    row = _owned(db, user, search_id)
    if body.alert and not row.alert:
        row.last_alerted_at = datetime.now(UTC)  # never email the backlog
    row.alert = body.alert
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_search(search_id: UUID, db: Db, user: CurrentUser) -> Response:
    db.delete(_owned(db, user, search_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
