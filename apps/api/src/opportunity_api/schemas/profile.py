"""Profile request/response schemas with Bachelor/Master field validation."""

from datetime import datetime
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from opportunity_api.models.profile import DegreeLevel, StudyYear

Preference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

GRADUATION_YEAR_MIN = 1900
GRADUATION_YEAR_MAX = 2100


def _validate_degree_level(value: str | None) -> str | None:
    if value is not None and value not in DegreeLevel.__members__:
        allowed = ", ".join(DegreeLevel.__members__)
        raise ValueError(f"degree_level must be one of: {allowed}")
    return value


def _validate_graduation_year(value: int | None) -> int | None:
    if value is not None and not (GRADUATION_YEAR_MIN <= value <= GRADUATION_YEAR_MAX):
        raise ValueError(
            f"graduation_year must be between {GRADUATION_YEAR_MIN} and {GRADUATION_YEAR_MAX}"
        )
    return value


def _validate_social_url(value: str | None, host: str) -> str | None:
    if value is None:
        return None
    url = urlparse(value)
    if (
        url.scheme != "https"
        or url.hostname not in {host, f"www.{host}"}
        or not url.path.strip("/")
        or url.username
        or url.password
        or url.port
    ):
        raise ValueError(f"Enter a valid https://{host}/ profile URL")
    return value


class ProfileResponse(BaseModel):
    """Full profile representation returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    study_year: StudyYear | None = None
    interests: list[Preference] | None = Field(default=None, max_length=50)
    preferred_tech_domains: list[Preference] | None = Field(default=None, max_length=50)
    preferred_locations: list[Preference] | None = Field(default=None, max_length=50)
    remote_preferred: bool | None = None

    headline: str | None
    bio: str | None
    location: str | None
    resume_url: str | None
    linkedin_url: str | None = None
    github_url: str | None = None
    degree_level: str | None
    field_of_study: str | None
    university: str | None
    graduation_year: int | None
    created_at: datetime
    updated_at: datetime


class ProfileUpsert(BaseModel):
    """Full replacement payload for PUT /profile. Omitted fields are cleared."""

    study_year: StudyYear | None = None
    interests: list[Preference] | None = Field(default=None, max_length=50)
    preferred_tech_domains: list[Preference] | None = Field(default=None, max_length=50)
    preferred_locations: list[Preference] | None = Field(default=None, max_length=50)
    remote_preferred: bool | None = None

    headline: str | None = Field(default=None, max_length=255)
    bio: str | None = None
    location: str | None = Field(default=None, max_length=255)
    resume_url: str | None = Field(default=None, max_length=512)
    linkedin_url: str | None = Field(default=None, max_length=512)
    github_url: str | None = Field(default=None, max_length=512)
    degree_level: str | None = None
    field_of_study: str | None = Field(default=None, max_length=255)
    university: str | None = Field(default=None, max_length=255)
    graduation_year: int | None = None

    _v_degree = field_validator("degree_level")(_validate_degree_level)
    _v_year = field_validator("graduation_year")(_validate_graduation_year)
    _v_linkedin = field_validator("linkedin_url")(
        lambda value: _validate_social_url(value, "linkedin.com")
    )
    _v_github = field_validator("github_url")(lambda value: _validate_social_url(value, "github.com"))


class ProfilePatch(BaseModel):
    """Partial update payload for PATCH /profile. Only sent fields change."""

    study_year: StudyYear | None = None
    interests: list[Preference] | None = Field(default=None, max_length=50)
    preferred_tech_domains: list[Preference] | None = Field(default=None, max_length=50)
    preferred_locations: list[Preference] | None = Field(default=None, max_length=50)
    remote_preferred: bool | None = None

    headline: str | None = Field(default=None, max_length=255)
    bio: str | None = None
    location: str | None = Field(default=None, max_length=255)
    resume_url: str | None = Field(default=None, max_length=512)
    linkedin_url: str | None = Field(default=None, max_length=512)
    github_url: str | None = Field(default=None, max_length=512)
    degree_level: str | None = None
    field_of_study: str | None = Field(default=None, max_length=255)
    university: str | None = Field(default=None, max_length=255)
    graduation_year: int | None = None

    _v_degree = field_validator("degree_level")(_validate_degree_level)
    _v_year = field_validator("graduation_year")(_validate_graduation_year)
    _v_linkedin = field_validator("linkedin_url")(
        lambda value: _validate_social_url(value, "linkedin.com")
    )
    _v_github = field_validator("github_url")(lambda value: _validate_social_url(value, "github.com"))
