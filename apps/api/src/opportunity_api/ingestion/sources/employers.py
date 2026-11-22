"""Explicit employer allowlist; identifiers are data, never arbitrary fetch URLs."""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from ..registry import AdapterRegistry
from .ats import GreenhouseAdapter, LeverAdapter, SmartRecruitersAdapter
from .http import PublicJSONClient

REGISTRY = Path(__file__).with_name("employers.json")


class Employer(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=255)
    provider: Literal["greenhouse", "lever", "smartrecruiters"]
    identifier: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    careers_url: HttpUrl
    region: Literal["global", "eu"] = "global"
    enabled: bool = False

    @model_validator(mode="after")
    def valid_config(self):
        if (
            self.careers_url.scheme != "https"
            or self.careers_url.username
            or self.careers_url.password
        ):
            raise ValueError("careers URL must be credential-free HTTPS")
        if self.region == "eu" and self.provider != "lever":
            raise ValueError("EU region is only supported by Lever")
        return self

    @property
    def source_name(self):
        return f"{self.provider}.{self.identifier.lower()}"


def load_employers(path: Path = REGISTRY) -> list[Employer]:
    employers = [Employer.model_validate(row) for row in json.loads(path.read_text())]
    names = [employer.source_name for employer in employers]
    if len(names) != len(set(names)):
        raise ValueError("duplicate employer source")
    return employers


def employer_registry(
    employers: list[Employer] | None = None, client: PublicJSONClient | None = None
) -> AdapterRegistry:
    """One adapter per company: failures remain isolated by the existing runner.

    Disabled candidates are intentionally excluded until their careers identifiers
    and usage terms are checked. Calling this function never performs network I/O.
    """
    registry = AdapterRegistry()
    client = client or PublicJSONClient()
    adapters = {
        "greenhouse": GreenhouseAdapter,
        "lever": LeverAdapter,
        "smartrecruiters": SmartRecruitersAdapter,
    }
    for employer in load_employers() if employers is None else employers:
        if employer.enabled:
            registry.register(adapters[employer.provider](employer, client))
    return registry
