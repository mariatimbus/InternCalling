"""Offline public response regression tests and C3 fixture dry runs."""

import io
import json
from pathlib import Path
from urllib.error import HTTPError, URLError

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from opportunity_api.core.database import Base
from opportunity_api.ingestion.normalize import normalize
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.sources.ats import (
    GreenhouseAdapter,
    LeverAdapter,
    SmartRecruitersAdapter,
)
from opportunity_api.ingestion.sources.employers import Employer, employer_registry, load_employers
from opportunity_api.ingestion.sources.http import MAX_BYTES, PublicJSONClient
from opportunity_api.ingestion.validate import validate
from opportunity_api.models import Opportunity

FIXTURES = Path(__file__).parent / "fixtures" / "ats"
ADAPTERS = [GreenhouseAdapter, LeverAdapter, SmartRecruitersAdapter]


def fixture(provider, kind):
    return json.loads((FIXTURES / f"{provider}_{kind}.json").read_text())


def employer(provider, identifier="fixture", **kwargs):
    return Employer(
        name="Fixture Employer",
        provider=provider,
        identifier=identifier,
        careers_url="https://example.org/careers",
        enabled=True,
        **kwargs,
    )


class Client:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.urls = []

    def get(self, url):
        self.urls.append(url)
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


def successful_client(provider):
    payload = fixture(provider, "success")
    if provider == "smartrecruiters":
        return Client({"content": [{"id": payload["id"]}], "totalFound": 1}, payload)
    return Client(payload)


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.mark.parametrize("adapter_type", ADAPTERS)
def test_real_response_normalizes_and_dry_runs(adapter_type, session):
    provider = adapter_type.provider
    adapter = adapter_type(employer(provider), successful_client(provider))
    records = list(adapter.fetch())
    assert len(records) == 1
    raw = records[0]
    normalized = validate(normalize(raw))
    expected = json.loads((FIXTURES / "expected.json").read_text())[provider]
    assert raw.description
    assert raw.title == expected["title"]
    assert raw.source_id == expected["source_id"]
    assert raw.source_url == expected["source_url"]
    assert raw.location == expected["location"]
    assert normalized.source == adapter.source_name
    assert normalized.source_id == raw.source_id
    assert normalized.url.startswith("https://")
    assert raw.fetched_at.utcoffset().total_seconds() == 0
    assert raw.deadline_raw is raw.degree_level_raw is raw.study_year_raw is None
    adapter.client = successful_client(provider)
    report = IngestionRunner(OpportunityStore(session), dry_run=True).run([adapter])
    assert report.totals().fetched == 1
    assert report.totals().failed == 0
    assert not report.failed_sources
    assert report.totals().accepted == 1
    assert report.totals().rejected == 0
    assert report.totals().review_required == 0
    assert report.totals().would_create == 1
    assert session.scalar(select(func.count()).select_from(Opportunity)) == 0


@pytest.mark.parametrize("adapter_type", ADAPTERS)
def test_empty(adapter_type):
    adapter = adapter_type(
        employer(adapter_type.provider), Client(fixture(adapter_type.provider, "empty"))
    )
    assert list(adapter.fetch()) == []


@pytest.mark.parametrize("adapter_type", ADAPTERS)
@pytest.mark.parametrize("failure", ["shape", "timeout", "http", "json"])
def test_company_failure_does_not_stop_next_company(adapter_type, failure, session):
    provider = adapter_type.provider
    response = {
        "shape": fixture(provider, "malformed"),
        "timeout": TimeoutError(),
        "http": HTTPError("https://example.org", 503, "Unavailable", {}, None),
        "json": json.JSONDecodeError("invalid", "", 0),
    }[failure]
    broken = adapter_type(employer(provider, "broken"), Client(response))
    healthy = adapter_type(employer(provider, "healthy"), successful_client(provider))
    report = IngestionRunner(OpportunityStore(session), dry_run=True).run([broken, healthy])
    assert report.failed_sources == [broken.source_name]
    assert report.source(healthy.source_name).fetched == 1


@pytest.mark.parametrize("adapter_type", ADAPTERS)
def test_malformed_record_keeps_valid_sibling_and_reports_failure(adapter_type, session):
    provider = adapter_type.provider
    payload = fixture(provider, "success")
    if provider == "greenhouse":
        payload["jobs"].insert(0, {"id": "bad"})
        client = Client(payload)
    elif provider == "lever":
        payload.insert(0, {"id": "bad"})
        client = Client(payload)
    else:
        client = Client(
            {"content": [{"id": "bad"}, {"id": payload["id"]}], "totalFound": 2},
            {"id": "bad"},
            payload,
        )
    adapter = adapter_type(employer(provider), client)
    report = IngestionRunner(OpportunityStore(session), dry_run=True).run([adapter])
    assert report.failed_sources == [adapter.source_name]
    assert report.totals().fetched == 1


def test_lever_pagination(monkeypatch):
    monkeypatch.setattr("opportunity_api.ingestion.sources.ats.PAGE_SIZE", 1)
    client = Client(fixture("lever", "success"), [])
    assert len(list(LeverAdapter(employer("lever"), client).fetch())) == 1
    assert "skip=1" in client.urls[-1]


def test_lever_eu_and_repeated_page(monkeypatch):
    monkeypatch.setattr("opportunity_api.ingestion.sources.ats.PAGE_SIZE", 1)
    payload = fixture("lever", "success")
    adapter = LeverAdapter(employer("lever", region="eu"), Client(payload, payload))
    assert adapter.endpoint.startswith("https://api.eu.lever.co/")
    with pytest.raises(ValueError, match="repeated page"):
        list(adapter.fetch())


def test_smartrecruiters_pagination_and_truncation():
    payload = fixture("smartrecruiters", "success")
    other = dict(payload, id="second-posting")
    client = Client(
        {"content": [{"id": payload["id"]}], "totalFound": 2},
        payload,
        {"content": [{"id": other["id"]}], "totalFound": 2},
        other,
    )
    assert len(list(SmartRecruitersAdapter(employer("smartrecruiters"), client).fetch())) == 2
    assert "offset=1" in client.urls[2]
    broken = Client({"content": [], "totalFound": 2})
    with pytest.raises(ValueError, match="truncated"):
        list(SmartRecruitersAdapter(employer("smartrecruiters"), broken).fetch())
    page = {"content": [{"id": payload["id"]}], "totalFound": 2}
    repeated = Client(page, payload, page)
    with pytest.raises(ValueError, match="repeated posting"):
        list(SmartRecruitersAdapter(employer("smartrecruiters"), repeated).fetch())


@pytest.mark.parametrize("adapter_type", ADAPTERS)
def test_c3_scope_and_rerun_identity(adapter_type, session):
    # Explicit synthetic variants test policy independent of today's live vacancies.
    provider = adapter_type.provider
    rows = list(adapter_type(employer(provider), successful_client(provider)).fetch())
    raw = rows[0].model_copy(
        update={"title": "Software Engineering Intern", "location": "Berlin, Germany"}
    )

    class Static(adapter_type):
        def fetch(self):
            yield raw
            yield raw.model_copy(update={"source_id": "senior", "title": "Senior Engineer"})
            yield raw.model_copy(update={"source_id": "usa", "location": "USA"})

    adapter = Static(employer(provider))
    runner = IngestionRunner(OpportunityStore(session))
    first, second = runner.run([adapter]), runner.run([adapter])
    assert first.totals().created == 1
    assert first.totals().rejected == 2
    assert second.totals().updated == 1
    assert session.scalar(select(func.count()).select_from(Opportunity)) == 1


def test_registry_allowlist_and_shared_client():
    employers = load_employers()
    assert 20 <= len(employers) <= 30
    assert len({e.source_name for e in employers}) == len(employers)
    registry = employer_registry(employers)
    assert len(registry.names()) == sum(e.enabled for e in employers)
    adapters = employer_registry([employer("lever"), employer("greenhouse")]).resolve()
    assert adapters[0].client is adapters[1].client
    assert (
        employer_registry([employer("lever").model_copy(update={"enabled": False})]).names() == []
    )


@pytest.mark.parametrize(
    "update",
    [
        {"identifier": "../escape"},
        {"region": "eu"},
        {"careers_url": "http://example.org"},
        {"secret": "forbidden"},
    ],
)
def test_registry_rejects_unexpected_configuration(update):
    fields = employer("greenhouse").model_dump()
    fields.update(update)
    with pytest.raises(ValueError):
        Employer.model_validate(fields)


class Opener:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request.full_url, timeout))
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return io.BytesIO(result)


def test_http_robots_cache_and_rate_limit():
    opener = Opener(b"User-agent: *\nDisallow:\nCrawl-delay: 3", b"[]", b"[]")
    sleeps = []
    client = PublicJSONClient(open_url=opener, clock=lambda: 0, sleep=sleeps.append)
    assert client.get("https://example.org/jobs") == []
    assert client.get("https://example.org/jobs") == []
    assert [r[0] for r in opener.requests].count("https://example.org/robots.txt") == 1
    assert sleeps == [3, 3]
    assert all(r[1] == 15 for r in opener.requests)


@pytest.mark.parametrize(
    "rules", [b"User-agent: *\nDisallow: /", HTTPError("https://example.org", 403, "", {}, None)]
)
def test_robots_denial_and_failure_fail_closed(rules):
    opener = Opener(rules)
    with pytest.raises((ValueError, HTTPError)):
        PublicJSONClient(open_url=opener).get("https://example.org/jobs")
    assert len(opener.requests) == 1


def test_robots_404_and_transient_retry():
    opener = Opener(HTTPError("", 404, "", {}, None), URLError("offline"), b"[]")
    sleeps = []
    client = PublicJSONClient(open_url=opener, sleep=sleeps.append, clock=lambda: 0)
    assert client.get("https://example.org/jobs") == []
    assert len(opener.requests) == 3
    assert sleeps


@pytest.mark.parametrize(
    "error", [TimeoutError(), HTTPError("", 429, "", {"Retry-After": "2"}, None)]
)
def test_retry_exhaustion(error):
    opener = Opener(b"User-agent: *\nDisallow:", error, error, error)
    with pytest.raises((TimeoutError, HTTPError)):
        PublicJSONClient(open_url=opener, sleep=lambda _: None).get("https://example.org/jobs")
    assert len(opener.requests) == 4


@pytest.mark.parametrize(
    "response",
    [
        HTTPError("", 404, "", {}, None),
        HTTPError("", 429, "", {"Retry-After": "120"}, None),
        b"invalid json",
        b"x" * (MAX_BYTES + 1),
    ],
)
def test_permanent_errors_and_bad_json_are_not_retried(response):
    opener = Opener(b"User-agent: *\nDisallow:", response)
    with pytest.raises((ValueError, HTTPError)):
        PublicJSONClient(open_url=opener, sleep=lambda _: None).get("https://example.org/jobs")
    assert len(opener.requests) == 2


def test_no_redirects_or_credentials():
    from opportunity_api.ingestion.sources.http import NoRedirect

    assert NoRedirect().redirect_request(None, None, 302, "", {}, "http://internal") is None
    with pytest.raises(ValueError):
        PublicJSONClient().get("http://example.org")
    with pytest.raises(ValueError):
        PublicJSONClient().get("https://user:password@example.org")
