"""Profile v2 persistence, validation and user isolation."""

import pytest

from tests.conftest import auth_headers


def test_preferences_persist_and_are_private(client):
    a = auth_headers(client, "a@example.com")
    b = auth_headers(client, "b@example.com")
    payload = {
        "study_year": "third",
        "interests": ["python"],
        "preferred_locations": ["Berlin"],
        "preferred_tech_domains": ["backend"],
        "remote_preferred": True,
    }
    response = client.patch("/api/v1/profile", headers=a, json=payload)
    assert response.status_code == 200
    saved = client.get("/api/v1/profile", headers=a).json()
    for field, value in payload.items():
        assert saved[field] == value
    other = client.get("/api/v1/profile", headers=b).json()
    assert other["study_year"] is None
    assert other["interests"] is None
    assert (
        client.patch("/api/v1/profile", headers=a, json={"interests": None}).json()["interests"]
        is None
    )


@pytest.mark.parametrize(
    "payload",
    [{"study_year": "seventh"}, {"interests": "python"}, {"preferred_locations": [["Berlin"]]}],
)
def test_preferences_reject_invalid_values(client, payload):
    assert (
        client.patch(
            "/api/v1/profile", headers=auth_headers(client, "a@example.com"), json=payload
        ).status_code
        == 422
    )


def test_profile_v2_unknown_and_replacement_semantics(client):
    headers = auth_headers(client, "profile@example.invalid")
    fresh = client.get("/api/v1/profile", headers=headers).json()
    assert fresh["study_year"] is None
    assert fresh["remote_preferred"] is None
    assert client.patch(
        "/api/v1/profile",
        headers=headers,
        json={
            "study_year": "second",
            "interests": ["  AI  "],
            "remote_preferred": True,
        },
    ).json()["interests"] == ["AI"]
    assert (
        client.patch(
            "/api/v1/profile", headers=headers, json={"headline": "Keep preferences"}
        ).json()["study_year"]
        == "second"
    )
    replaced = client.put("/api/v1/profile", headers=headers, json={"headline": "Reset"}).json()
    assert replaced["study_year"] is None
    assert replaced["interests"] is None
    assert replaced["remote_preferred"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"interests": [" "]},
        {"preferred_locations": ["x" * 101]},
        {"preferred_tech_domains": ["backend"] * 51},
        {"interests": [12]},
    ],
)
def test_preferences_have_bounded_values(client, payload):
    assert (
        client.patch(
            "/api/v1/profile", headers=auth_headers(client, "bounds@example.invalid"), json=payload
        ).status_code
        == 422
    )
