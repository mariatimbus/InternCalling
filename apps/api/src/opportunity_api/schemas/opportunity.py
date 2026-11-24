"""Opportunity response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, model_validator

from opportunity_api.catalog_presentation import english_text
from opportunity_api.ingestion.sources.employers import company_domains
from opportunity_api.models.opportunity import OpportunityDegreeLevel, OpportunityType

from .skill import SkillResponse


class OpportunityResponse(BaseModel):
    """Full opportunity representation returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    organization: str | None
    opportunity_type: OpportunityType
    location: str | None
    url: str
    source: str
    source_id: str
    deadline: datetime | None
    posted_at: datetime | None
    is_active: bool
    degree_level: OpportunityDegreeLevel | None
    study_year: list[int] | None
    skills: list[SkillResponse]

    @model_validator(mode="after")
    def display_in_english(self):
        self.title, self.description = english_text(self.title, self.description)
        return self

    @computed_field
    @property
    def company_domain(self) -> str | None:
        """The employer's website domain (for its logo), when the source registry knows it."""
        return company_domains().get(self.source.lower())


class PaginatedOpportunityResponse(BaseModel):
    items: list[OpportunityResponse]
    page: int
    page_size: int
    total: int
