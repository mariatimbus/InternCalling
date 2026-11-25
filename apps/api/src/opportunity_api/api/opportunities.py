"""Opportunity catalog endpoints: paginated list with filters and detail by id."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.database import get_db
from ..core.errors import APIError
from ..eligibility import evaluate as evaluate_eligibility
from ..matching import AIScorer, OllamaEmbedder, score_match
from ..matching import filters as job_filters
from ..matching.engine import to_opportunity_input
from ..matching.filters import Field, Schedule, WorkModel
from ..models import (
    Opportunity,
    OpportunityDegreeLevel,
    OpportunityType,
    Profile,
    ProfileEntry,
    User,
)
from ..schemas import OpportunityResponse, PaginatedOpportunityResponse
from ..schemas.eligibility import EligibilityResult, StudentInput
from ..schemas.matching import (
    EvidenceEntry,
    LanguageSkill,
    MatchingOpportunity,
    MatchingProfile,
    MatchResult,
)
from ..schemas.recommendation import Recommendation, RecommendationPage
from ..schemas.workspace import WORK_TYPES, experience_type
from .deps import get_current_user

router = APIRouter(prefix="/opportunities", tags=["opportunities"])

Db = Annotated[Session, Depends(get_db)]

MAX_PAGE_SIZE = 100
# Newest first; nulls last so unposted opportunities sink to the end.
_ORDER = (Opportunity.posted_at.desc().nullslast(), Opportunity.id)


def _apply_filters(
    stmt: Select,
    *,
    opportunity_type: OpportunityType | None,
    degree_level: OpportunityDegreeLevel | None,
    location: str | None,
    is_active: bool | None,
    deadline_after: datetime | None,
    deadline_before: datetime | None,
    search: str | None,
) -> Select:
    if opportunity_type is not None:
        stmt = stmt.where(Opportunity.opportunity_type == opportunity_type)
    if degree_level is not None:
        # A specific degree matches itself and "both"; null (unknown) never
        # matches a degree filter.
        if degree_level is OpportunityDegreeLevel.both:
            stmt = stmt.where(Opportunity.degree_level == degree_level)
        else:
            stmt = stmt.where(
                Opportunity.degree_level.in_([degree_level, OpportunityDegreeLevel.both])
            )
    if location:
        stmt = stmt.where(Opportunity.location.ilike(f"%{location}%"))
    if is_active is not None:
        stmt = stmt.where(Opportunity.is_active == is_active)
    if deadline_after is not None:
        stmt = stmt.where(Opportunity.deadline >= deadline_after)
    if deadline_before is not None:
        stmt = stmt.where(Opportunity.deadline <= deadline_before)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                Opportunity.title.ilike(pattern),
                Opportunity.organization.ilike(pattern),
                Opportunity.description.ilike(pattern),
            )
        )
    return stmt


@router.get("", response_model=PaginatedOpportunityResponse)
def list_opportunities(
    db: Db,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    opportunity_type: OpportunityType | None = None,
    degree_level: OpportunityDegreeLevel | None = None,
    study_year: Annotated[int | None, Query(ge=1, le=6)] = None,
    location: str | None = None,
    # Public listings never include hidden (inactive or under review) postings.
    is_active: bool = True,
    deadline_after: datetime | None = None,
    deadline_before: datetime | None = None,
    search: str | None = None,
) -> PaginatedOpportunityResponse:
    if not is_active:
        raise APIError(
            "Hidden opportunities are not listed.", status_code=422, code="validation_error"
        )
    filters = dict(
        opportunity_type=opportunity_type,
        degree_level=degree_level,
        location=location,
        is_active=is_active,
        deadline_after=deadline_after,
        deadline_before=deadline_before,
        search=search,
    )
    total_stmt = _apply_filters(select(func.count()).select_from(Opportunity), **filters)
    total = db.scalar(total_stmt)

    # The study_year containment filter is applied in Python (see below), so
    # its total must be recomputed there too; keep the SQL count for the rest.
    stmt = _apply_filters(select(Opportunity), **filters)
    if study_year is None:
        # Two queries (count + page) are intentional: cheap at MVP volumes and
        # far simpler than a window-function count over the same filter set.
        items = db.scalars(
            stmt.options(selectinload(Opportunity.skills))
            .order_by(*_ORDER)
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    else:
        # Containment filter: on Postgres this should become a jsonb @>
        # predicate; sqlite (tests/dev) filters in memory — fine at MVP
        # volumes. null study_year means unknown and never matches.
        matches = [
            opportunity
            for opportunity in db.scalars(
                stmt.options(selectinload(Opportunity.skills)).order_by(*_ORDER)
            )
            if opportunity.study_year and study_year in opportunity.study_year
        ]
        total = len(matches)
        start = (page - 1) * page_size
        items = matches[start : start + page_size]

    return PaginatedOpportunityResponse(items=items, page=page, page_size=page_size, total=total)


@lru_cache
def _build_ai_scorer(url: str, model: str) -> AIScorer:
    return AIScorer(OllamaEmbedder(url, model))


def get_ai_scorer() -> AIScorer | None:
    """AI component for matching; ``None`` when Ollama is not configured."""
    settings = get_settings()
    if not settings.ollama_url:
        return None
    return _build_ai_scorer(settings.ollama_url, settings.ollama_embed_model)


def _get_opportunity_or_404(db: Session, opportunity_id: UUID) -> Opportunity:
    opportunity = db.scalar(
        select(Opportunity)
        .where(Opportunity.id == opportunity_id)
        .options(selectinload(Opportunity.skills))
    )
    if opportunity is None:
        raise APIError(
            "Opportunity not found",
            status_code=status.HTTP_404_NOT_FOUND,
            code="not_found",
        )
    return opportunity


def _study_year(profile: Profile) -> int | None:
    years = ["first", "second", "third", "fourth", "fifth", "sixth"]
    return years.index(profile.study_year) + 1 if profile.study_year in years else None


def _to_student_input(profile: Profile) -> StudentInput:

    return StudentInput(
        study_year=_study_year(profile),
        degree_level=profile.degree_level,
        graduation_year=profile.graduation_year,
        location=profile.location,
    )


@dataclass
class _Evidence:
    skills: list[str] = field(default_factory=list)
    roles: list[str] = field(default_factory=list)
    languages: list[LanguageSkill] = field(default_factory=list)
    certificates: list[str] = field(default_factory=list)
    entries: list[EvidenceEntry] = field(default_factory=list)


def _text_list(value) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item.strip()]
    return [value] if isinstance(value, str) and value.strip() else []


def _field(values: dict, key: str) -> str:
    value = values.get(key)
    return value if isinstance(value, str) else ""


def _profile_evidence(db: Session, user: User) -> _Evidence:
    """What the student saved in Profile collections, as matching evidence."""
    found = _Evidence()
    entries = db.scalars(
        select(ProfileEntry).where(
            ProfileEntry.user_id == user.id,
            ProfileEntry.section.in_(("projects", "experience", "languages", "certificates")),
        )
    )
    for entry in entries:
        values = entry.values if isinstance(entry.values, dict) else {}
        if entry.section == "languages" and _field(values, "name").strip():
            found.languages.append(
                LanguageSkill(
                    name=_field(values, "name"),
                    cefr=_field(values, "cefr").upper(),
                    native=values.get("native") is True,
                )
            )
        elif entry.section == "certificates" and _field(values, "name").strip():
            found.certificates.append(
                f"{_field(values, 'name')} {_field(values, 'organization')}".strip()
            )
        elif entry.section in ("projects", "experience"):
            found.skills += _text_list(values.get("technologies"))
            if _field(values, "role").strip():
                found.roles.append(_field(values, "role"))
            if entry.section == "experience":
                title = " at ".join(
                    filter(None, [_field(values, "role"), _field(values, "organization")])
                )
                body = [_field(values, "description"), *_text_list(values.get("achievements"))]
            else:
                title = _field(values, "name") or _field(values, "role")
                body = [
                    _field(values, "role"),
                    _field(values, "description"),
                    *_text_list(values.get("technologies")),
                ]
            if title:
                # Research, clubs and volunteering show relevant work, not industry experience.
                industry = entry.section == "experience" and experience_type(values) in WORK_TYPES
                kind = "experience" if industry else "project"
                found.entries.append(
                    EvidenceEntry(kind=kind, title=title[:255], text="\n".join(body)[:5000])
                )
    return found


def _to_matching_profile(user: User, db: Session) -> MatchingProfile:
    profile = user.profile
    evidence = _profile_evidence(db, user)
    return MatchingProfile(
        study_year=_study_year(profile),
        degree_level=profile.degree_level,
        graduation_year=profile.graduation_year,
        location=profile.location,
        field_of_study=profile.field_of_study,
        skills=list(dict.fromkeys([skill.name for skill in user.skills] + evidence.skills)),
        roles=evidence.roles,
        languages=evidence.languages,
        certificates=evidence.certificates,
        evidence=evidence.entries,
        interests=profile.interests or [],
        preferred_tech_domains=profile.preferred_tech_domains or [],
        preferred_locations=profile.preferred_locations or [],
        remote_preferred=profile.remote_preferred,
    )


def _to_matching_opportunity(opportunity: Opportunity) -> MatchingOpportunity:
    return MatchingOpportunity(
        title=opportunity.title,
        description=opportunity.description,
        location=opportunity.location,
        degree_level=opportunity.degree_level,
        study_year=opportunity.study_year,
        skills=[skill.name for skill in opportunity.skills],
        posted_at=opportunity.posted_at,
    )


@router.get("/recommended", response_model=RecommendationPage)
def recommended_opportunities(
    db: Db,
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    opportunity_type: OpportunityType = OpportunityType.internship,
    degree_level: OpportunityDegreeLevel | None = None,
    study_year: Annotated[int | None, Query(ge=1, le=6)] = None,
    location: Annotated[str | None, Query(max_length=255)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    deadline_after: datetime | None = None,
    deadline_before: datetime | None = None,
    work_model: WorkModel | None = None,
    schedule: Schedule | None = None,
    field: Field | None = None,
    posted_within: Annotated[int | None, Query(ge=1, le=365)] = None,
    no_experience: bool = False,
    sort: Literal["match", "recent", "deadline", "company"] = "match",
) -> RecommendationPage:
    """Filter all active, unexpired candidates, score, sort, then paginate.

    Missing requirements stay visible: a degree or study-year filter only hides postings
    that state a different one. Confirmed mismatches are excluded. Work model, schedule,
    field and experience are read from the posting's own text (``matching/filters.py``).
    UUID breaks score ties so pagination is deterministic for an unchanged catalog.
    No external model calls are required for this deterministic ranking.
    """
    stmt = _apply_filters(
        select(Opportunity),
        opportunity_type=opportunity_type,
        degree_level=None,  # applied below, keeping postings that do not state one
        location=location,
        is_active=True,
        deadline_after=deadline_after,
        deadline_before=deadline_before,
        search=search,
    ).where(or_(Opportunity.deadline.is_(None), Opportunity.deadline >= datetime.now(UTC)))
    if posted_within is not None:
        since = datetime.now(UTC) - timedelta(days=posted_within)
        stmt = stmt.where(Opportunity.posted_at >= since)
    stmt = stmt.options(selectinload(Opportunity.skills))
    allowed_degrees = (
        {degree_level}
        if degree_level is OpportunityDegreeLevel.both
        else {degree_level, OpportunityDegreeLevel.both}
        if degree_level is not None
        else None
    )
    profile = _to_matching_profile(user, db)
    student = _to_student_input(user.profile)
    ranked = []
    for opportunity in db.scalars(stmt):
        title, text = opportunity.title, opportunity.description
        if allowed_degrees and opportunity.degree_level not in (None, *allowed_degrees):
            continue
        if (
            study_year is not None
            and opportunity.study_year
            and study_year not in opportunity.study_year
        ):
            continue
        if work_model and job_filters.work_model(title, opportunity.location, text) != work_model:
            continue
        if schedule and job_filters.schedule(title, text) != schedule:
            continue
        if field and field not in job_filters.fields(title, text):
            continue
        if no_experience and job_filters.asks_experience(title, text):
            continue
        inputs = _to_matching_opportunity(opportunity)
        match = score_match(profile, inputs)
        if match.eligibility == "not_eligible":
            continue
        ranked.append(
            Recommendation(
                opportunity=OpportunityResponse.model_validate(opportunity),
                match=match,
                eligibility=evaluate_eligibility(student, to_opportunity_input(inputs)),
            )
        )

    # Ties always fall back to the stronger match, then the newer posting, then a stable id.
    def stamp(value: datetime | None) -> float:
        return value.timestamp() if value else 0.0

    def base(item):
        return (-item.match.score, -stamp(item.opportunity.posted_at), str(item.opportunity.id))

    if sort == "recent":  # newest first; postings without a date last
        ranked.sort(
            key=lambda item: (
                item.opportunity.posted_at is None,
                -stamp(item.opportunity.posted_at),
                *base(item),
            )
        )
    elif sort == "deadline":  # closing soonest first; open-ended postings last
        ranked.sort(
            key=lambda item: (
                item.opportunity.deadline is None,
                stamp(item.opportunity.deadline),
                *base(item),
            )
        )
    elif sort == "company":
        ranked.sort(
            key=lambda item: ((item.opportunity.organization or "~").casefold(), *base(item))
        )
    else:
        ranked.sort(key=base)
    start = (page - 1) * page_size
    return RecommendationPage(
        items=ranked[start : start + page_size], total=len(ranked), page=page, page_size=page_size
    )


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
def get_opportunity(db: Db, opportunity_id: UUID) -> Opportunity:
    return _get_opportunity_or_404(db, opportunity_id)


@router.get("/{opportunity_id}/eligibility", response_model=EligibilityResult)
def get_opportunity_eligibility(
    db: Db,
    opportunity_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
) -> EligibilityResult:
    """A9 full eligibility assessment for the current user's profile."""
    opportunity = _get_opportunity_or_404(db, opportunity_id)
    return evaluate_eligibility(
        _to_student_input(user.profile),
        to_opportunity_input(_to_matching_opportunity(opportunity)),
    )


@router.get("/{opportunity_id}/match", response_model=MatchResult)
def get_opportunity_match(
    db: Db,
    opportunity_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    ai: Annotated[AIScorer | None, Depends(get_ai_scorer)],
) -> MatchResult:
    """Explainable match score (A10 core + optional A11/A12 AI component)."""
    opportunity = _get_opportunity_or_404(db, opportunity_id)
    return score_match(
        _to_matching_profile(user, db),
        _to_matching_opportunity(opportunity),
        ai=ai,
    )
