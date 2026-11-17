"""Public ATS parsers. All roles go to C3; no eligibility inference or writes."""

from collections.abc import Iterator
from datetime import UTC, datetime
from urllib.parse import quote, urlencode, urlsplit

from ..models import RawOpportunity
from .base import SourceAdapter
from .http import PublicJSONClient

PAGE_SIZE = 100
MAX_PAGES = 100
COUNTRIES = dict(
    zip(
        (
            "at be bg ch cy cz de dk ee es fi fr gb gr hr hu ie is it lt lu lv mt "
            "nl no pl pt ro se si sk us in ca"
        ).split(),
        [
            "Austria",
            "Belgium",
            "Bulgaria",
            "Switzerland",
            "Cyprus",
            "Czechia",
            "Germany",
            "Denmark",
            "Estonia",
            "Spain",
            "Finland",
            "France",
            "United Kingdom",
            "Greece",
            "Croatia",
            "Hungary",
            "Ireland",
            "Iceland",
            "Italy",
            "Lithuania",
            "Luxembourg",
            "Latvia",
            "Malta",
            "Netherlands",
            "Norway",
            "Poland",
            "Portugal",
            "Romania",
            "Sweden",
            "Slovenia",
            "Slovakia",
            "United States",
            "India",
            "Canada",
        ],
        strict=True,
    )
)


def text(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("expected nonblank source text")
    return value


def identity(value: object) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("invalid posting identifier")
    return text(str(value))


def application_url(value: object) -> str:
    value = text(value)
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise ValueError("expected official HTTPS application URL")
    return value


class ATSAdapter(SourceAdapter):
    provider: str

    def __init__(self, employer, client: PublicJSONClient | None = None):
        if employer.provider != self.provider:
            raise ValueError("employer/provider mismatch")
        self.employer = employer
        self.client = client or PublicJSONClient()
        self.source_name = employer.source_name

    def raw(self, row, *, title, url, location=None, description=None):
        return RawOpportunity(
            source=self.source_name,
            source_id=identity(row["id"]),
            source_url=application_url(url),
            title=text(title),
            organization=self.employer.name,
            location=location,
            description=description,
            fetched_at=datetime.now(UTC),
        )

    def records(self) -> Iterator[dict]:
        raise NotImplementedError

    def fetch(self):
        malformed = False
        for row in self.records():
            try:
                yield self.parse_record(row)
            except (ValueError, TypeError, KeyError, AttributeError):
                # Keep valid siblings; fail the company visibly after processing them.
                malformed = True
        if malformed:
            raise ValueError("one or more postings could not be parsed")


class GreenhouseAdapter(ATSAdapter):
    provider = "greenhouse"

    @property
    def endpoint(self):
        return f"https://boards-api.greenhouse.io/v1/boards/{self.employer.identifier}/jobs"

    def records(self):
        payload = self.client.get(self.endpoint + "?content=true")
        rows = payload["jobs"]
        if not isinstance(rows, list):
            raise ValueError("expected jobs array")
        yield from rows

    def parse_record(self, raw):
        return self.raw(
            raw,
            title=raw["title"],
            url=raw["absolute_url"],
            location=raw.get("location", {}).get("name"),
            description=raw.get("content"),
        )


class LeverAdapter(ATSAdapter):
    provider = "lever"

    @property
    def endpoint(self):
        host = "api.eu.lever.co" if self.employer.region == "eu" else "api.lever.co"
        return f"https://{host}/v0/postings/{self.employer.identifier}"

    def records(self):
        seen = set()
        for page in range(MAX_PAGES):
            params = urlencode({"mode": "json", "skip": page * PAGE_SIZE, "limit": PAGE_SIZE})
            rows = self.client.get(self.endpoint + "?" + params)
            if not isinstance(rows, list):
                raise ValueError("expected postings array")
            signature = repr(rows)
            if rows and signature in seen:
                raise ValueError("repeated page")
            seen.add(signature)
            yield from rows
            if len(rows) < PAGE_SIZE:
                return
        raise ValueError("pagination limit reached")

    def parse_record(self, raw):
        description = raw.get("descriptionPlain") or raw.get("description") or ""
        for section in raw.get("lists", []):
            description += "\n" + text(section["text"]) + "\n" + text(section["content"])
        description += "\n" + (raw.get("additional") or "")
        return self.raw(
            raw,
            title=raw["text"],
            url=raw.get("applyUrl") or raw.get("hostedUrl"),
            location=raw.get("categories", {}).get("location"),
            description=description or None,
        )


class SmartRecruitersAdapter(ATSAdapter):
    provider = "smartrecruiters"

    @property
    def endpoint(self):
        return f"https://api.smartrecruiters.com/v1/companies/{self.employer.identifier}/postings"

    def records(self):
        offset = 0
        seen = set()
        for _ in range(MAX_PAGES):
            payload = self.client.get(
                self.endpoint + "?" + urlencode({"offset": offset, "limit": PAGE_SIZE})
            )
            rows, total = payload["content"], payload["totalFound"]
            if not isinstance(rows, list) or type(total) is not int or total < 0:
                raise ValueError("invalid postings page")
            if not rows and offset < total:
                raise ValueError("truncated postings page")
            for row in rows:
                # Construct a trusted endpoint; never follow source-supplied refs.
                posting_id = quote(identity(row["id"]), safe="")
                if posting_id in seen:
                    raise ValueError("repeated posting across pages")
                seen.add(posting_id)
                yield self.client.get(self.endpoint + "/" + posting_id)
            offset += len(rows)
            if offset >= total:
                return
        raise ValueError("pagination limit reached")

    def parse_record(self, raw):
        location = raw.get("location", {})
        country = location.get("country", "")
        country = COUNTRIES.get(country.lower(), country)
        place = ", ".join(filter(None, [location.get("city"), location.get("region"), country]))
        if location.get("remote"):
            place = ", ".join(filter(None, [place, "Remote"]))
        sections = raw.get("jobAd", {}).get("sections", {})
        description = "\n".join(
            text(section["text"]) for section in sections.values() if section.get("text")
        )
        return self.raw(
            raw,
            title=raw["name"],
            url=raw["applyUrl"],
            location=place or None,
            description=description or None,
        )
