"""Globally ranked opportunity responses."""

from pydantic import BaseModel

from .eligibility import EligibilityResult
from .matching import MatchResult
from .opportunity import OpportunityResponse


class Recommendation(BaseModel):
    opportunity: OpportunityResponse
    match: MatchResult
    eligibility: EligibilityResult


class RecommendationPage(BaseModel):
    items: list[Recommendation]
    page: int
    page_size: int
    total: int
