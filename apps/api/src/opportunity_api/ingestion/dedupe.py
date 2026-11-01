"""Conservative identity matching, shared by within-run dedupe and persistence."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from opportunity_api.models import Opportunity

from .normalize import canonical_url, clean_text
from .report import IngestionError

# Only known language selectors may differ when considering a weak fingerprint.
LANGUAGE_PARAMS = frozenset({"lang", "language", "locale"})


def storage_id(record: Any) -> str:
    return record.source_id or "urlhash:" + hashlib.sha256(record.url.encode()).hexdigest()


def explicit_id(record: Any) -> str | None:
    value = record.source_id
    generated = (
        isinstance(record, Opportunity)
        and value == "urlhash:" + hashlib.sha256(record.url.encode()).hexdigest()
    )
    return value if value and not generated else None


def utc(value: datetime) -> datetime:
    # SQLite drops timezone metadata for stored timestamps; source input does not use this rule.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def conservative_fingerprint(record: Any) -> str | None:
    if not all((record.organization, record.title, record.location, record.deadline)):
        return None
    parts = urlsplit(record.url)
    # Different explicit identifiers inside URLs must not be merged by a weak fingerprint.
    if re.search(
        r"/(?:jobs?|positions?|requisitions?|postings?|openings?|vacancies)/[^/]+",
        parts.path,
        re.I,
    ):
        return None
    if (
        any(
            k.lower() not in LANGUAGE_PARAMS
            for k, _ in parse_qsl(parts.query, keep_blank_values=True)
        )
        or parts.fragment
    ):
        return None
    values = [
        clean_text(s).casefold() for s in (record.organization, record.title, record.location)
    ]
    values += [utc(record.deadline).isoformat(), str(record.opportunity_type)]
    # Any different authority/path is a distinct URL identity, including opaque
    # slugs, numeric IDs and UUIDs in arbitrary path layouts. No provider guesses.
    # Only known language query selectors may vary in this weak fallback.
    values.append(urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")))
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode()).hexdigest()


@dataclass(frozen=True)
class IdentityMatch:
    kind: str
    record: Any


class Deduplicator:
    """A fresh instance per run. Matching never mutates an opportunity."""

    def __init__(self) -> None:
        self.providers: dict[tuple[str, str], Any] = {}
        self.urls: dict[str, list[Any]] = {}
        self.fingerprints: dict[str, list[Any]] = {}

    def remember(self, record: Any) -> None:
        if key := explicit_id(record):
            self.providers[(record.source, key)] = record
        try:
            url = canonical_url(record.url)
        except ValueError:
            return  # legacy invalid URLs cannot establish an official URL identity
        self.urls.setdefault(url, []).append(record)
        if not explicit_id(record) and (key := conservative_fingerprint(record)):
            self.fingerprints.setdefault(key, []).append(record)

    def forget(self, record: Any) -> None:
        for key, value in list(self.providers.items()):
            if value is record:
                del self.providers[key]
        for index in (self.urls, self.fingerprints):
            for key, values in list(index.items()):
                index[key] = [value for value in values if value is not record]
                if not index[key]:
                    del index[key]

    def find(self, record: Any, *, allow_update: bool = False) -> IdentityMatch | None:
        key = explicit_id(record)
        primary = self.providers.get((record.source, key)) if key else None
        url = canonical_url(record.url)
        urls = self.urls.get(url, [])
        if primary is not None:
            if any(other is not primary for other in urls):
                raise IngestionError(
                    "identity_conflict", "Provider ID and URL identify different rows.", review=True
                )
            if not allow_update and canonical_url(primary.url) != url:
                raise IngestionError(
                    "identity_conflict",
                    "Repeated provider ID has contradictory URLs in this batch.",
                    review=True,
                )
            return IdentityMatch("provider_id", primary)
        if len(urls) > 1:
            raise IngestionError(
                "identity_conflict", "Several stored rows share this canonical URL.", review=True
            )
        if urls:
            other = urls[0]
            if (
                key
                and explicit_id(other)
                and record.source == other.source
                and key != explicit_id(other)
            ):
                raise IngestionError(
                    "identity_conflict",
                    "Different explicit IDs from one provider share a URL.",
                    review=True,
                )
            if (not allow_update or record.source != other.source) and (
                (clean_text(record.title) or "").casefold()
                != (clean_text(other.title) or "").casefold()
                or (clean_text(record.organization) or "").casefold()
                != (clean_text(other.organization) or "").casefold()
            ):
                raise IngestionError(
                    "identity_conflict",
                    "Shared URL has contradictory organization or role text.",
                    review=True,
                )
            return IdentityMatch("url", other)
        if not key and (fingerprint := conservative_fingerprint(record)):
            matches = self.fingerprints.get(fingerprint, [])
            if len(matches) > 1:
                raise IngestionError(
                    "identity_conflict", "A weak fingerprint matches multiple rows.", review=True
                )
            if matches:
                return IdentityMatch("fingerprint", matches[0])
        return None

    def __call__(self, record: Any) -> bool:
        if self.find(record) is not None:
            return True
        self.remember(record)
        return False
