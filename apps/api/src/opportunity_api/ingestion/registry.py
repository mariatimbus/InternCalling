"""Shared registries for explicit adapters and configured C4 ATS sources.

``build_registry().resolve()`` is the C5 entry point. It creates a fresh registry
and shared HTTP client, without fetching or opening a database. The legacy
``register``/``resolve`` helpers retain their explicit, initially empty registry.
"""

from pathlib import Path
from typing import TYPE_CHECKING

from .sources.base import SourceAdapter

if TYPE_CHECKING:
    from .sources.http import PublicJSONClient


class AdapterRegistry:
    """Name → adapter mapping with selection helpers."""

    def __init__(self) -> None:
        self._adapters: dict[str, SourceAdapter] = {}

    def register(self, adapter: SourceAdapter) -> None:
        name = adapter.source_name
        if not name:
            raise ValueError("adapter needs a non-empty source_name")
        if name in self._adapters:
            raise ValueError(f"adapter already registered: {name}")
        self._adapters[name] = adapter

    def get(self, name: str) -> SourceAdapter:
        try:
            return self._adapters[name]
        except KeyError:
            available = ", ".join(self.names()) or "(none)"
            raise KeyError(f"unknown source: {name!r}; available: {available}") from None

    def names(self) -> list[str]:
        return sorted(self._adapters)

    def resolve(self, selection: list[str] | tuple[str, ...] | None = None) -> list[SourceAdapter]:
        """Adapters for ``selection`` (all active sources when ``None``)."""
        if selection is None:
            return [self._adapters[name] for name in self.names()]
        return [self.get(name) for name in selection]


default_registry = AdapterRegistry()


def register(adapter: SourceAdapter) -> None:
    default_registry.register(adapter)


def resolve(selection: list[str] | tuple[str, ...] | None = None) -> list[SourceAdapter]:
    return default_registry.resolve(selection)


def build_registry(
    *,
    providers: Path | None = None,
    employers: Path | None = None,
    client: "PublicJSONClient | None" = None,
) -> AdapterRegistry:
    """Register all supported C4 adapters whose provider AND employer are enabled."""
    # Local imports avoid the employers -> AdapterRegistry import cycle.
    from .config import PROVIDERS, load_providers
    from .sources.employers import REGISTRY, employer_registry, load_employers

    config = load_providers(providers if providers is not None else PROVIDERS)
    companies = load_employers(employers if employers is not None else REGISTRY)
    return employer_registry([e for e in companies if config.enabled(e.provider)], client)
