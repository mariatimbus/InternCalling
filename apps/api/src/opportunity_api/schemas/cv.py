from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from opportunity_api.ai.schemas import CVExtraction

ReviewField = Literal[
    "headline",
    "location",
    "degree_level",
    "field_of_study",
    "university",
    "graduation_year",
    "skills",
    "interests",
]


class CVResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    media_type: str
    size_bytes: int
    status: str
    extraction: CVExtraction | None
    extraction_model: str | None
    provenance: dict | None
    reviewed_at: datetime | None
    created_at: datetime


class CVReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fields: list[ReviewField] = Field(min_length=1, max_length=8)
