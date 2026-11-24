"""Live profile collection contracts, matching the existing typed editors."""

import re
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

Section = Literal["experience", "projects", "certificates", "honours", "languages", "publications"]
SECTIONS = ("experience", "projects", "certificates", "honours", "languages", "publications")
Short = Annotated[str, Field(max_length=255)]
Required = Annotated[str, Field(min_length=1, max_length=255)]
Long = Annotated[str, Field(max_length=5000)]


def partial_date(value: str):
    if not value:
        return None
    if not re.fullmatch(r"\d{4}(-\d{2})?", value):
        raise ValueError("Use YYYY or YYYY-MM")
    year, *month = map(int, value.split("-"))
    if not 1900 <= year <= 2100 or month and not 1 <= month[0] <= 12:
        raise ValueError("Invalid partial date")
    return year, month[0] if month else None


def ordered_dates(start: str, end: str):
    left, right = partial_date(start), partial_date(end)
    if (
        left
        and right
        and (
            right[0] < left[0]
            or right[0] == left[0]
            and left[1]
            and right[1]
            and right[1] < left[1]
        )
    ):
        raise ValueError("End date precedes start date")


def safe_url(value: str):
    if not value:
        return
    url = urlsplit(value)
    if (
        len(value) > 512
        or url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or any(c.isspace() or ord(c) < 32 for c in value)
        or "\\" in value
    ):
        raise ValueError("Use an absolute HTTP(S) URL without credentials")
    _ = url.port


def validate_json_text(value, depth=0):
    if depth > 12:
        raise ValueError("Request nesting exceeds the supported depth")
    if isinstance(value, str):
        if any((ord(c) < 32 and c not in "\n\r\t") or 0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise ValueError("Remove unsupported control characters")
    elif isinstance(value, dict):
        if len(value) > 1000:
            raise ValueError("Too many request fields")
        for key, item in value.items():
            validate_json_text(key, depth + 1)
            validate_json_text(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > 1000:
            raise ValueError("Too many request items")
        for item in value:
            validate_json_text(item, depth + 1)
    return value


class Draft(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def safe_text(cls, value):
        return validate_json_text(value)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExperienceDraft(Draft):
    role: Required
    organization: Required
    location: Short = ""
    startDate: Short
    endDate: Short = ""
    current: StrictBool = False
    description: Long = ""
    achievements: str = Field(default="", max_length=10020)

    @model_validator(mode="after")
    def valid(self):
        if not self.startDate or not self.current and not self.endDate:
            raise ValueError("Start and non-current end dates are required")
        ordered_dates(self.startDate, self.endDate)
        if self.current and self.endDate:
            raise ValueError("Current role has no end date")
        bullets = [s.strip() for s in self.achievements.splitlines() if s.strip()]
        if len(bullets) > 20 or any(len(s) > 500 for s in bullets):
            raise ValueError("Use at most 20 short achievements")
        return self


class ProjectDraft(Draft):
    name: Required
    role: Short = ""
    description: Long = ""
    technologies: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=100
    )
    startDate: Short = ""
    endDate: Short = ""
    ongoing: StrictBool = False
    repositoryUrl: str = ""
    demoUrl: str = ""

    @model_validator(mode="after")
    def valid(self):
        ordered_dates(self.startDate, self.endDate)
        if self.ongoing and self.endDate:
            raise ValueError("Ongoing project has no end date")
        safe_url(self.repositoryUrl)
        safe_url(self.demoUrl)
        if len({s.casefold() for s in self.technologies}) != len(self.technologies):
            raise ValueError("Technologies must be distinct")
        return self


class CertificateDraft(Draft):
    name: Required
    organization: Required
    issueDate: Short = ""
    expirationDate: Short = ""
    doesNotExpire: StrictBool = False
    credentialId: Short = ""
    credentialUrl: str = ""

    @model_validator(mode="after")
    def valid(self):
        ordered_dates(self.issueDate, self.expirationDate)
        if self.doesNotExpire and self.expirationDate:
            raise ValueError("Non-expiring credential has no expiration date")
        safe_url(self.credentialUrl)
        return self


class HonourDraft(Draft):
    title: Required
    organization: Short = ""
    receivedDate: Short = ""
    description: Long = ""
    referenceUrl: str = ""

    @model_validator(mode="after")
    def valid(self):
        partial_date(self.receivedDate)
        safe_url(self.referenceUrl)
        return self


class LanguageDraft(Draft):
    name: Required
    cefr: Literal["", "A1", "A2", "B1", "B2", "C1", "C2"] = ""
    native: StrictBool = False
    referenceName: Short = ""
    referenceUrl: str = ""

    @model_validator(mode="after")
    def valid(self):
        if self.native and self.cefr:
            raise ValueError("Native and CEFR are separate choices")
        safe_url(self.referenceUrl)
        return self


class PublicationDraft(Draft):
    title: Required
    authors: str = Field(default="", max_length=25600)
    publisher: Short = ""
    publicationDate: Short = ""
    doi: str = Field(default="", max_length=512)
    publicationUrl: str = ""
    description: Long = ""

    @model_validator(mode="after")
    def valid(self):
        partial_date(self.publicationDate)
        safe_url(self.publicationUrl)
        authors = [s.strip() for s in self.authors.splitlines() if s.strip()]
        if len(authors) > 100 or any(len(s) > 255 for s in authors):
            raise ValueError("Use at most 100 short author names")
        if self.doi:
            value = self.doi
            if value.lower().startswith("https://doi.org/"):
                safe_url(value)
                if "?" in value or "#" in value:
                    raise ValueError("DOI URL has no query or fragment")
                value = unquote(value[len("https://doi.org/") :])
            if (
                not re.fullmatch(r"10\.\d+(?:\.\d+)*/[^\s]+", value)
                or "\\" in value
                or any(ord(c) < 32 for c in value)
                or value.split("/", 1)[1] in {".", ".."}
            ):
                raise ValueError("Invalid DOI identifier")
            self.doi = value
        return self


DRAFTS = dict(
    zip(
        SECTIONS,
        (
            ExperienceDraft,
            ProjectDraft,
            CertificateDraft,
            HonourDraft,
            LanguageDraft,
            PublicationDraft,
        ),
        strict=True,
    )
)


class EntryMutation(Draft):
    values: dict
    revision: Annotated[StrictInt, Field(ge=1)] | None = None


class Identity(Draft):
    id: str = Field(min_length=1, max_length=100)
    revision: Annotated[StrictInt, Field(ge=1)]


class ReviewChanges(Draft):
    requestId: str = Field(min_length=1, max_length=100)
    jobId: str = Field(min_length=1, max_length=100)
    source: Identity
    profileRevision: str = Field(min_length=1, max_length=100)
    profile: dict = Field(default_factory=dict)
    skills: dict = Field(default_factory=dict)
    collections: list[dict] = Field(default_factory=list, max_length=100)


class SourceRequest(Draft):
    source: Identity
