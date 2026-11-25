"""Matching schemas: explainable score output and engine inputs (A10).

A score is never a bare number: it ships with the eligibility status that
gated it, the per-component breakdown, and the reasons behind each
component. All of it deterministic — no AI, no embeddings (that is A11/A12).
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from opportunity_api.models.opportunity import OpportunityDegreeLevel
from opportunity_api.models.profile import DegreeLevel
from opportunity_api.schemas.eligibility import EligibilityStatus


class ComponentScores(BaseModel):
    """Points earned per requirement (see ``requirements.py``) plus the optional AI bonus."""

    skills: int = 0
    field_fit: int = 0
    languages: int = 0
    experience: int = 0
    eligibility: int = 0
    location: int = 0
    ai: int = 0


RequirementKey = Literal[
    "skills", "field_fit", "languages", "experience", "eligibility", "location"
]


class Requirement(BaseModel):
    """One thing the posting asks for, checked against the profile.

    Only requirements the posting actually states are listed; the score is the share of
    their weights the student meets.
    """

    key: RequirementKey
    label: str
    status: Literal["met", "partial", "missing"]
    summary: str
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    weight: int
    earned: float


class MatchResult(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    score: int = Field(ge=0, le=100)
    eligibility: EligibilityStatus
    components: ComponentScores
    reasons: list[str]
    requirements: list[Requirement] = Field(default_factory=list)


class MatchingProfile(BaseModel):
    """What we know about the student. Reuses the A9 eligibility fields."""

    model_config = ConfigDict(str_strip_whitespace=True)

    degree_level: DegreeLevel | None = None
    study_year: int | None = Field(default=None, ge=1, le=7)
    graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    location: str | None = Field(default=None, max_length=255)
    field_of_study: str | None = Field(default=None, max_length=255)
    skills: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    preferred_tech_domains: list[str] = Field(default_factory=list)
    preferred_locations: list[str] = Field(default_factory=list)
    remote_preferred: bool | None = None
    # Role titles from the student's experience and projects ("Frontend Developer").
    roles: list[str] = Field(default_factory=list)
    languages: list["LanguageSkill"] = Field(default_factory=list)
    certificates: list[str] = Field(default_factory=list)
    # Saved experience and projects, as evidence of relevant experience.
    evidence: list["EvidenceEntry"] = Field(default_factory=list)


class LanguageSkill(BaseModel):
    name: str
    cefr: str = ""
    native: bool = False


class EvidenceEntry(BaseModel):
    kind: Literal["experience", "project"]
    title: str
    text: str = ""


class MatchingOpportunity(BaseModel):
    """What we know about the opportunity."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    location: str | None = Field(default=None, max_length=255)
    degree_level: OpportunityDegreeLevel | None = None
    study_year: list[int] | None = None
    skills: list[str] = Field(default_factory=list)
    posted_at: datetime | None = None


MatchingProfile.model_rebuild()
