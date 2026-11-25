"""Global ranking regression tests: filtering precedes scoring and pagination."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from opportunity_api.models import OpportunityDegreeLevel
from tests.conftest import auth_headers
from tests.test_opportunities import make_opportunity, seed

URL = "/api/v1/opportunities/recommended"


@pytest.fixture()
def headers(client):
    headers = auth_headers(client, "rank@example.invalid")
    assert (
        client.patch(
            "/api/v1/profile",
            headers=headers,
            json={
                "degree_level": "bachelor",
                "interests": ["python"],
                "study_year": "third",
            },
        ).status_code
        == 200
    )
    # Skills are a requirement the score counts; interests are not.
    skills = client.put("/api/v1/profile/skills", headers=headers, json={"names": ["python"]})
    assert skills.status_code == 200
    return headers


def test_ranking_is_global_not_page_local(client, db_factory, headers):
    weak = [make_opportunity(title=f"General internship {i}") for i in range(25)]
    best = make_opportunity(title="Python internship")
    seed(db_factory, *weak, best)
    result = client.get(URL, headers=headers, params={"page_size": 12}).json()
    assert result["total"] == 26
    assert result["items"][0]["opportunity"]["id"] == str(best.id)
    ids = []
    for page in range(1, 4):
        data = client.get(URL, headers=headers, params={"page_size": 12, "page": page}).json()
        ids.extend(item["opportunity"]["id"] for item in data["items"])
    assert len(set(ids)) == len(ids) == 26
    assert client.get(URL, headers=headers, params={"page_size": 12}).json() == result
    assert client.get(URL, headers=headers, params={"page": 99}).json()["items"] == []


def test_excludes_mismatch_inactive_expired_but_preserves_unknown(client, db_factory, headers):
    unknown = make_opportunity(title="Unknown requirements")
    seed(
        db_factory,
        unknown,
        make_opportunity(is_active=False),
        make_opportunity(deadline=datetime.now(UTC) - timedelta(days=1)),
        make_opportunity(degree_level=OpportunityDegreeLevel.master),
        make_opportunity(study_year=[1]),
    )
    result = client.get(URL, headers=headers).json()
    assert result["total"] == 1
    item = result["items"][0]
    assert item["opportunity"]["id"] == str(unknown.id)
    assert item["match"]["eligibility"] in ("unknown", "possibly_eligible")
    assert any(rule["status"] == "unknown" for rule in item["eligibility"]["reasons"])
    assert set(item["match"]["components"]) == {
        "skills",
        "field_fit",
        "languages",
        "experience",
        "eligibility",
        "location",
        "ai",
    }


def test_filters_apply_before_ranking(client, db_factory, headers):
    seed(
        db_factory,
        make_opportunity(title="Python intern", location="Paris", study_year=[3]),
        make_opportunity(title="General intern", location="Berlin", study_year=[3]),
    )
    result = client.get(URL, headers=headers, params={"location": "Berlin", "study_year": 3}).json()
    assert result["total"] == 1
    assert result["items"][0]["opportunity"]["location"] == "Berlin"
    assert client.get(URL, headers=headers, params={"search": "absent"}).json()["total"] == 0


def test_ties_use_uuid_not_insertion_order(client, db_factory, headers):
    first = make_opportunity(id=uuid.UUID(int=1))
    last = make_opportunity(id=uuid.UUID(int=2))
    seed(db_factory, last, first)
    result = client.get(URL, headers=headers).json()
    assert [item["opportunity"]["id"] for item in result["items"]] == [str(first.id), str(last.id)]


def test_recommendations_are_personalized_and_require_auth(client, db_factory, headers):
    job = make_opportunity(degree_level=OpportunityDegreeLevel.master)
    seed(db_factory, job)
    other = auth_headers(client, "other@example.invalid")
    client.patch("/api/v1/profile", headers=other, json={"degree_level": "master"})
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=headers).json()["total"] == 0
    assert client.get(URL, headers=other).json()["total"] == 1
    assert client.get(URL, headers=other, params={"page_size": 101}).status_code == 422
