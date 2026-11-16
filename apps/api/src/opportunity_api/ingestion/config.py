"""Credential-free provider switches. All supported providers must be explicit."""

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict

PROVIDERS = Path(__file__).with_name("sources") / "providers.json"


class ProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    greenhouse: bool
    lever: bool
    smartrecruiters: bool

    def enabled(self, provider: str) -> bool:
        return self.model_dump()[provider]


def load_providers(path: Path = PROVIDERS) -> ProviderConfig:
    return ProviderConfig.model_validate(json.loads(path.read_text(encoding="utf-8")))
