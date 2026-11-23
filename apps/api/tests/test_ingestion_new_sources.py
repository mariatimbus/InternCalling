"""Offline tests for the Ashby and Arbeitnow sources and the SmartRecruiters fast path."""

import pytest

from opportunity_api.ingestion.scope import assess_scope
from opportunity_api.ingestion.sources.ats import (
    ArbeitnowAdapter,
    AshbyAdapter,
    SmartRecruitersAdapter,
)
from opportunity_api.ingestion.sources.employers import Employer, load_employers


class Client:
    def __init__(self, *responses):
        self.responses, self.urls = list(responses), []

    def get(self, url):
        self.urls.append(url)
        return self.responses.pop(0)


def employer(provider, identifier="fixture"):
    return Employer(
        name="Fixture Employer",
        provider=provider,
        identifier=identifier,
        careers_url="https://example.org/careers",
        enabled=True,
    )


def test_ashby_maps_locations_remote_and_skips_unlisted():
    job = {
        "id": "a1",
        "title": "Software Engineering Intern",
        "location": "Berlin",
        "secondaryLocations": [{"location": "Amsterdam"}],
        "address": {"postalAddress": {"addressCountry": "Germany"}},
        "workplaceType": "Remote",
        "isListed": True,
        "jobUrl": "https://jobs.ashbyhq.com/fixture/a1",
        "descriptionPlain": "Python",
    }
    hidden = dict(job, id="a2", isListed=False)
    adapter = AshbyAdapter(employer("ashby"), Client({"jobs": [job, hidden]}))
    [record] = list(adapter.fetch())
    assert adapter.endpoint == "https://api.ashbyhq.com/posting-api/job-board/fixture"
    assert record.location == "Berlin, Amsterdam, Germany, Remote"
    assert (record.source_id, record.organization) == ("a1", "Fixture Employer")
    assert record.source_url == "https://jobs.ashbyhq.com/fixture/a1"


def test_arbeitnow_paginates_dedupes_and_keeps_the_real_company():
    row = {
        "slug": "intern-1",
        "company_name": "Acme GmbH",
        "title": "Data Science Intern",
        "description": "<p>SQL</p>",
        "remote": True,
        "url": "https://www.arbeitnow.com/jobs/companies/acme/intern-1",
        "location": "Munich",
    }
    second = dict(row, slug="intern-2", remote=False, location="")
    client = Client(
        {"data": [row], "links": {"next": "page=2"}},
        {"data": [row, second], "links": {"next": None}},
    )
    adapter = ArbeitnowAdapter(employer("arbeitnow", "board"), client)
    records = list(adapter.fetch())
    assert [r.source_id for r in records] == ["intern-1", "intern-2"]
    assert records[0].organization == "Acme GmbH"
    assert records[0].location == "Munich, Remote, Europe" and records[1].location == "Europe"
    assert client.urls[1].endswith("?page=2")


def test_smartrecruiters_fetches_details_only_for_student_titles():
    detail = {
        "id": "s1",
        "name": "Software Intern",
        "applyUrl": "https://jobs.smartrecruiters.com/Fixture/s1",
        "location": {"city": "Cluj-Napoca", "country": "ro"},
        "jobAd": {"sections": {"jobDescription": {"text": "Python"}}},
    }
    page = {
        "content": [
            {"id": "s1", "name": "Software Intern"},
            {"id": "s2", "name": "Senior Sales Manager", "location": {"city": "Berlin"}},
        ],
        "totalFound": 2,
    }
    client = Client(page, detail)
    records = list(SmartRecruitersAdapter(employer("smartrecruiters", "Fixture"), client).fetch())
    assert len(client.urls) == 2  # list page + one detail, not one per posting
    assert records[0].location == "Cluj-Napoca, Romania"
    assert records[1].source_url == "https://jobs.smartrecruiters.com/Fixture/s2"
    assert not assess_scope(records[1].title, None, records[1].location).accepted


@pytest.mark.parametrize(
    ("location", "accepted"),
    [("Remote", True), ("Remote - US only", False), ("Berlin, Remote", True)],
)
def test_remote_scope(location, accepted):
    assert assess_scope("Backend Intern", "Python", location).accepted is accepted


def test_registry_has_new_providers_and_no_duplicates():
    employers = load_employers()
    providers = {e.provider for e in employers}
    assert {"ashby", "arbeitnow", "greenhouse", "lever", "smartrecruiters"} <= providers
    assert len({e.source_name for e in employers}) == len(employers)


def test_overlong_location_lists_are_shortened_not_dropped():
    job = {
        "id": "a1",
        "title": "Data Intern",
        "location": "; ".join(f"City {i}, Country" for i in range(40)),
        "jobUrl": "https://jobs.ashbyhq.com/fixture/a1",
    }
    [record] = list(AshbyAdapter(employer("ashby"), Client({"jobs": [job]})).fetch())
    assert len(record.location) <= 255 and record.location.endswith("...")


@pytest.mark.parametrize(
    ("title", "location", "code"),
    [
        ("Software Engineering Intern", "Berlin", "in_scope"),
        ("Software Engineering Intern", "Amsterdam, Noord-Holland, Nederland", "in_scope"),
        ("Software Engineering Intern", "Zurich, CH", "in_scope"),
        ("Software Engineering Intern", "Foster City, CA", "outside_europe"),
        ("Software Engineering Intern", "Hybrid - New York, NY", "outside_europe"),
        ("Brand Marketing Intern, France", "Paris", "not_stem"),
        ("Sales Engineering Intern", "London", "in_scope"),
        ("Data & People Analytics Intern", "Paris", "in_scope"),
    ],
)
def test_cities_and_title_based_stem_scope(title, location, code):
    assert assess_scope(title, "Python data cloud", location).code == code


def test_arbeitnow_locations_are_european():
    row = {
        "slug": "s",
        "company_name": "Acme",
        "title": "Backend Intern",
        "url": "https://www.arbeitnow.com/jobs/s",
        "location": "Greven",
    }
    client = Client({"data": [row], "links": {}})
    [record] = list(ArbeitnowAdapter(employer("arbeitnow", "board"), client).fetch())
    assert record.location == "Greven, Europe"
