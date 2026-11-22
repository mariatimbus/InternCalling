"""Deterministic, offline cleanup. Unknown source facts are never inferred."""

import re
from datetime import UTC, date, datetime
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .models import RawOpportunity
from .report import Notice

TRACKING_PARAMS = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "utm_id",
        "gclid",
        "dclid",
        "fbclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "igshid",
        "_ga",
        "_gl",
        "gh_src",
    }
)
MONTHS = {
    name: n
    for n, name in enumerate(
        (
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        ),
        1,
    )
}
MONTHS.update({name[:3]: n for name, n in tuple(MONTHS.items())})


def clean_text(value: str | None) -> str | None:
    return " ".join(value.split()) or None if value is not None else None


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "template"}:
            self.hidden.append(tag)
        if not self.hidden and tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]:
                self.hidden.pop()
        elif tag in {"p", "div", "li", "tr", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def clean_html(value: str | None) -> str | None:
    if value is None:
        return None
    parser = _Text()
    parser.feed(value)
    parser.close()
    return (
        "\n".join(filter(None, (clean_text(line) for line in "".join(parser.parts).splitlines())))
        or None
    )


def canonical_url(value: str) -> str:
    """Do not discard arbitrary query keys, fragments (SPA IDs) or path components."""
    value = value.strip()
    parts = urlsplit(value)
    if (
        parts.scheme.lower() not in {"http", "https"}
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or any(c.isspace() or ord(c) < 32 for c in value)
        or parts.port not in {None, 80, 443}
    ):
        raise ValueError("Expected a public HTTP(S) posting URL without credentials")
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    if any(k.lower() in {"access_token", "api_key", "password", "client_secret"} for k, _ in pairs):
        raise ValueError("Credential-bearing URLs are not official public posting URLs")
    host = parts.hostname.encode("idna").decode().lower()
    if ":" in host:
        host = f"[{host}]"
    if parts.port and (parts.scheme.lower(), parts.port) not in {("http", 80), ("https", 443)}:
        host += f":{parts.port}"
    query = urlencode([(k, v) for k, v in pairs if k.lower() not in TRACKING_PARAMS])
    return urlunsplit((parts.scheme.lower(), host, parts.path or "/", query, parts.fragment))


def parse_deadline(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return datetime.combine(date.fromisoformat(value), datetime.min.time(), UTC)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}.*", value):
            result = datetime.fromisoformat(value)
            return result.astimezone(UTC) if result.tzinfo else None
        if match := re.fullmatch(r"(\d{1,2}) ([A-Za-z]+) (\d{4})", value):
            day, month, year = match.groups()
            if month.lower() in MONTHS:
                return datetime(int(year), MONTHS[month.lower()], int(day), tzinfo=UTC)
    except ValueError:
        pass
    return None


def parse_degree(value: str | None) -> str | None:
    if not value:
        return None
    text = value.lower().strip()
    if text in {"both", "bachelor", "master"}:
        return text
    # Exact vocabulary and joiners only: preferences/negations/conditions stay unknown.
    text = re.sub(r"\bbachelor(?:'s)?\b|\bb\.?sc\.?\b|\bundergraduate\b", "B", text)
    text = re.sub(r"\bmaster(?:'s)?\b|\bm\.?sc\.?\b", "M", text)
    text = re.sub(r"\b(?:or|and|degree|degrees|student|students|programme|program)\b", "", text)
    text = re.sub(r"[\s/&,.'-]+", "", text)
    return {"B": "bachelor", "M": "master", "BM": "both", "MB": "both"}.get(text)


def parse_years(value: str | None) -> list[int] | None:
    if not value:
        return None
    text = value.lower().strip()
    text = re.sub(r"^study years?\s+|^years?\s+", "", text)
    if match := re.fullmatch(r"([1-6])(?:st|nd|rd|th) year", text):
        return [int(match[1])]
    if match := re.fullmatch(r"([1-6])\s*(?:-|–|to)\s*([1-6])", text):
        start, end = map(int, match.groups())
        return list(range(start, end + 1)) if start <= end else None
    if re.fullmatch(r"[1-6](?:\s*(?:,|/|or|and)\s*[1-6])*", text):
        return sorted({int(n) for n in re.findall(r"\d", text)})
    return None


def normalize(raw: RawOpportunity) -> dict[str, object]:
    notices = []
    deadline = parse_deadline(raw.deadline_raw)
    degree = parse_degree(raw.degree_level_raw)
    years = parse_years(raw.study_year_raw)
    for name, original, parsed in (
        ("deadline", raw.deadline_raw, deadline),
        ("degree_level", raw.degree_level_raw, degree),
        ("study_year", raw.study_year_raw, years),
    ):
        if original and parsed is None:
            notices.append(
                Notice(
                    f"{name}_unresolved",
                    f"Explicit {name} could not be mapped without assumptions.",
                )
            )
    # Validation happens after scope. No fabricated URN or source publication date.
    url = raw.source_url
    if url:
        try:
            url = canonical_url(url)
        except ValueError:
            pass  # validator reports a safe, stable reason, without echoing this URL
    return {
        "source": raw.source,
        "source_id": raw.source_id,
        "url": url,
        "title": clean_text(raw.title),
        "organization": clean_text(raw.organization),
        "description": clean_html(raw.description),
        "location": clean_text(raw.location),
        "deadline": deadline,
        "degree_level": degree,
        "study_year": years,
        "opportunity_type": (raw.model_extra or {}).get("opportunity_type", "internship"),
        "_notices": notices,
    }
