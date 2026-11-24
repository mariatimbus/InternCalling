"""Profile and skills endpoint tests."""

import pytest
from sqlalchemy.orm import Session

from opportunity_api.models import Skill
from tests.conftest import auth_headers


@pytest.fixture()
def headers(client):
    return auth_headers(client, "ada@example.com")


def test_get_profile_bootstraps_empty_profile(client, headers):
    response = client.get("/api/v1/profile", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["headline"] is None
    assert body["degree_level"] is None
    assert body["graduation_year"] is None
    assert body["user_id"]


def test_profile_requires_auth(client):
    assert client.get("/api/v1/profile").status_code == 401


def test_put_profile_stores_degree_fields(client, headers):
    response = client.put(
        "/api/v1/profile",
        headers=headers,
        json={
            "headline": "CS Master student",
            "location": "Berlin",
            "degree_level": "master",
            "field_of_study": "Computer Science",
            "university": "TU Berlin",
            "graduation_year": 2027,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["degree_level"] == "master"
    assert body["field_of_study"] == "Computer Science"
    assert body["university"] == "TU Berlin"
    assert body["graduation_year"] == 2027


def test_put_profile_rejects_invalid_degree_level(client, headers):
    response = client.put("/api/v1/profile", headers=headers, json={"degree_level": "phd"})
    assert response.status_code == 422


def test_put_profile_rejects_out_of_range_graduation_year(client, headers):
    for year in (1200, 2500):
        response = client.put("/api/v1/profile", headers=headers, json={"graduation_year": year})
        assert response.status_code == 422, year


def test_put_profile_clears_omitted_fields(client, headers):
    client.put(
        "/api/v1/profile",
        headers=headers,
        json={"headline": "hi", "degree_level": "bachelor", "graduation_year": 2026},
    )
    response = client.put("/api/v1/profile", headers=headers, json={"bio": "only bio"})
    body = response.json()
    assert body["bio"] == "only bio"
    assert body["headline"] is None
    assert body["degree_level"] is None


def test_patch_profile_updates_only_sent_fields(client, headers):
    client.put(
        "/api/v1/profile",
        headers=headers,
        json={"headline": "keep me", "degree_level": "bachelor", "graduation_year": 2026},
    )
    response = client.patch("/api/v1/profile", headers=headers, json={"graduation_year": 2027})
    body = response.json()
    assert body["graduation_year"] == 2027
    assert body["headline"] == "keep me"
    assert body["degree_level"] == "bachelor"


def test_patch_profile_can_clear_a_field(client, headers):
    client.put("/api/v1/profile", headers=headers, json={"headline": "temporary"})
    response = client.patch("/api/v1/profile", headers=headers, json={"headline": None})
    assert response.json()["headline"] is None


def test_profile_social_links_are_private_and_validated(client, headers):
    links = {"linkedin_url": "https://www.linkedin.com/in/ada", "github_url": "https://github.com/ada"}
    response = client.patch("/api/v1/profile", headers=headers, json=links)
    assert response.status_code == 200
    assert all(response.json()[key] == value for key, value in links.items())
    other = auth_headers(client, "other@example.com")
    assert client.get("/api/v1/profile", headers=other).json()["github_url"] is None
    for field, invalid in [("linkedin_url", "https://evil.example/in/ada"), ("github_url", "http://github.com/ada")]:
        assert client.patch("/api/v1/profile", headers=headers, json={field: invalid}).status_code == 422
    assert client.patch("/api/v1/profile", headers=headers, json={"github_url": None}).json()["github_url"] is None


def test_skills_replace_get_create(client, headers):
    response = client.put(
        "/api/v1/profile/skills", headers=headers, json={"names": ["Python", "SQL", "python"]}
    )
    assert response.status_code == 200
    names = [skill["name"] for skill in response.json()]
    assert names == ["python", "sql"]  # normalized, deduplicated


def test_skills_are_per_user(client):
    headers_a = auth_headers(client, "a@example.com")
    headers_b = auth_headers(client, "b@example.com")
    client.put("/api/v1/profile/skills", headers=headers_a, json={"names": ["python"]})

    response = client.get("/api/v1/profile/skills", headers=headers_b)
    assert response.json() == []
    response = client.get("/api/v1/profile/skills", headers=headers_a)
    assert [skill["name"] for skill in response.json()] == ["python"]


def test_skills_add_and_remove(client, headers):
    client.post("/api/v1/profile/skills", headers=headers, json={"name": "Go"})
    response = client.post("/api/v1/profile/skills", headers=headers, json={"name": "go"})
    names = [skill["name"] for skill in response.json()]
    assert names == ["go"]  # idempotent

    response = client.delete("/api/v1/profile/skills/go", headers=headers)
    assert response.json() == []

    response = client.delete("/api/v1/profile/skills/go", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "skill_not_found"


def test_skills_catalog_lists_all_skills(client, headers):
    client.put("/api/v1/profile/skills", headers=headers, json={"names": ["python", "sql"]})
    response = client.get("/api/v1/skills")
    assert response.status_code == 200
    assert [skill["name"] for skill in response.json()] == ["python", "sql"]


def test_skills_endpoints_require_auth(client):
    assert client.get("/api/v1/profile/skills").status_code == 401
    assert client.put("/api/v1/profile/skills", json={"names": ["x"]}).status_code == 401


def test_skill_creation_recovers_from_concurrent_insert(client, headers, db_factory, monkeypatch):
    """If another request inserts the skill between the select and the flush,
    the flush fails, the transaction rolls back, and the row is re-read."""
    original_flush = Session.flush
    inserted = False

    def racing_flush(self, objects=None):
        nonlocal inserted
        if not inserted and any(isinstance(obj, Skill) for obj in self.new):
            inserted = True
            with db_factory() as session:
                session.add(Skill(name="rust"))
                session.commit()
        return original_flush(self, objects)

    monkeypatch.setattr(Session, "flush", racing_flush)
    response = client.put("/api/v1/profile/skills", headers=headers, json={"names": ["rust"]})
    assert response.status_code == 200
    assert [skill["name"] for skill in response.json()] == ["rust"]


def test_profile_bootstrap_race_returns_the_existing_row(db_factory):
    """Two first requests race: the loser must reuse the winner's profile, not fail."""
    from uuid import uuid4

    from opportunity_api.api.deps import get_or_create_profile
    from opportunity_api.models import Profile, User

    user_id = uuid4()
    with db_factory() as setup:
        setup.add(User(id=user_id, email="race@example.com", full_name="Race"))
        setup.commit()
    with db_factory() as loser:
        user = loser.get(User, user_id)
        assert user.profile is None  # loaded before the winner commits
        with db_factory() as winner:
            winner.add(Profile(user_id=user_id, headline="winner"))
            winner.commit()
        profile = get_or_create_profile(loser, user)
        loser.commit()
        assert profile.headline == "winner"
    with db_factory() as check:
        assert len(check.query(Profile).filter_by(user_id=user_id).all()) == 1
