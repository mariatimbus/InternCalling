"""Strict CV drafts: every suggested value carries a verifiable quotation."""

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class Fact[T](BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: T
    evidence: str = Field(min_length=1, max_length=500)


class CVExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    headline: Fact[Text] | None
    location: Fact[Text] | None
    degree_level: Fact[Literal["bachelor", "master"]] | None
    field_of_study: Fact[Text] | None
    university: Fact[Text] | None
    graduation_year: Fact[Annotated[int, Field(ge=1900, le=2100)]] | None
    skills: list[Fact[Text]] = Field(max_length=100)
    interests: list[Fact[Text]] = Field(max_length=50)

    @model_validator(mode="after")
    def has_facts(self):
        if not any(getattr(self, name) for name in type(self).model_fields):
            raise ValueError("No explicit CV facts were extracted")
        return self

    def verify_evidence(self, text: str) -> None:
        def normalized(value):
            return re.sub(r"\s+", " ", str(value)).strip().casefold()

        source = normalized(text)
        for name in type(self).model_fields:
            value = getattr(self, name)
            facts = value if isinstance(value, list) else [value] if value else []
            for fact in facts:
                evidence = normalized(fact.evidence)
                if not evidence or evidence not in source or normalized(fact.value) not in evidence:
                    raise ValueError("Extracted fact is not grounded in the document")

    def values_for(self, name: str):
        fact = getattr(self, name)
        return (
            [item.value for item in fact]
            if isinstance(fact, list)
            else fact.value
            if fact
            else None
        )
