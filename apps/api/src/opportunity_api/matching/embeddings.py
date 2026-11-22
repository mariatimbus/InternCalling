"""Embedding backends for AI matching (A11/A12).

The embedder contract returns ``None`` on any failure — an unreachable or
unconfigured Ollama must degrade the pipeline to its deterministic v1
behavior, never break it (AGENTS.md: the core product operates without
optional AI services).
"""

from typing import Protocol

import httpx

from opportunity_api.ai.client import AIInvalidOutput, AIUnavailable, OllamaClient


class Embedder(Protocol):
    """Text → dense vectors. ``None`` means „unavailable, use fallback"."""

    def embed(self, texts: list[str]) -> list[list[float]] | None: ...


class OllamaEmbedder:
    """Compatibility adapter over the shared optional-model client."""

    def __init__(
        self, base_url: str, model: str, *, timeout: float = 5.0, client: httpx.Client | None = None
    ) -> None:
        self._model = model
        try:
            self._client = OllamaClient(base_url, timeout=timeout, client=client)
        except AIUnavailable:
            self._client = None

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        if self._client is None:
            return None
        try:
            return self._client.embed(self._model, texts)
        except (AIUnavailable, AIInvalidOutput):
            return None


class StaticEmbedder:
    """Test/dev embedder: maps text to a caller-provided vector.

    Not for production — exists so tests and local demos exercise the AI
    path deterministically without a running Ollama.
    """

    def __init__(self, mapping: dict[str, list[float]]) -> None:
        self._mapping = mapping

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        try:
            return [list(self._mapping[text]) for text in texts]
        except KeyError:
            return None
