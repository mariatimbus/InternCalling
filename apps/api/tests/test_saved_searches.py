"""Saved searches: owner-only CRUD, limits, and the daily alert email run."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from opportunity_api import alerts
from opportunity_api.core.config import Settings
from opportunity_api.models import OpportunityDegreeLevel, SavedSearch, User
from tests.conftest import auth_headers
from tests.test_opportunities import make_opportunity, seed

URL = "/api/v1/saved-searches"


@pytest.fixture
def ada(client):
    return auth_headers(client, "ada@example.com")


@pytest.fixture
def bob(client):
    return auth_headers(client, "bob@example.com")


def create(client, headers, **body):
    return client.post(
        URL, json={"name": "Python in Berlin", "search": "python", **body}, headers=headers
    )


def test_saved_searches_belong_to_their_owner(client: TestClient, ada, bob):
    assert client.get(URL).status_code == 401
    made = create(client, ada, location=" Berlin ")
    assert made.status_code == 201, made.text
    saved = made.json()
    assert (saved["search"], saved["location"], saved["alert"]) == ("python", "Berlin", False)
    assert client.get(URL, headers=bob).json()["items"] == []  # RLS-equivalent scoping
    assert (
        client.patch(f"{URL}/{saved['id']}", json={"alert": True}, headers=bob).status_code == 404
    )
    assert client.delete(f"{URL}/{saved['id']}", headers=bob).status_code == 404
    assert client.patch(f"{URL}/{saved['id']}", json={"alert": True}, headers=ada).json()["alert"]
    assert client.delete(f"{URL}/{saved['id']}", headers=ada).status_code == 204
    assert client.get(URL, headers=ada).json()["items"] == []


def test_saved_search_validation_and_limits(client: TestClient, ada):
    assert client.post(URL, json={"name": "Nothing"}, headers=ada).status_code == 422
    assert create(client, ada, degree_level="phd").status_code == 422
    assert create(client, ada).status_code == 201
    assert create(client, ada, name="python in berlin").status_code == 409  # same name
    for n in range(9):
        assert create(client, ada, name=f"Search {n}").status_code == 201
    assert create(client, ada, name="Eleventh").json()["error"]["code"] == "limit_reached"


class FakeSMTP:
    def __init__(self):
        self.sent = []

    def send_message(self, message):
        self.sent.append(message)


SETTINGS = Settings(smtp_host="smtp.example.invalid", alerts_from="alerts@example.invalid")


def test_alert_run_emails_only_new_matches_once(client: TestClient, db_factory, ada):
    profile = client.put("/api/v1/profile", json={"degree_level": "bachelor"}, headers=ada)
    assert profile.status_code == 200, profile.text
    search_id = create(client, ada, alert=True, location="Berlin").json()["id"]
    with db_factory() as db:
        row = db.get(SavedSearch, UUID(search_id))
        row.last_alerted_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()
    seed(
        db_factory,
        make_opportunity(
            title="Python Backend Intern", description="Python APIs", location="Berlin"
        ),
        make_opportunity(title="Python Intern", description="Python", location="Paris"),  # filtered
        make_opportunity(
            title="Python Research Intern",
            description="Python",
            location="Berlin",
            degree_level=OpportunityDegreeLevel.master,  # a confirmed mismatch is never sent
        ),
    )
    with db_factory() as db:
        assert alerts.run(db, SETTINGS, send=False)["items"] == 1  # dry run sends nothing
        smtp = FakeSMTP()
        stats = alerts.run(db, SETTINGS, send=True, smtp=smtp)
        assert (stats["emails"], stats["items"]) == (1, 1)
        [email] = smtp.sent
        assert email["To"] == "ada@example.com"
        assert email["Subject"] == "1 new internship for “Python in Berlin”"
        text = email.get_body(("plain",)).get_content()
        assert "Python Backend Intern" in text and "Research" not in text and "Paris" not in text
        assert "<script" not in email.get_body(("html",)).get_content()
        again = FakeSMTP()
        alerts.run(db, SETTINGS, send=True, smtp=again)
        assert again.sent == []  # the window moved: nothing is sent twice
        user = db.scalar(select(User).where(User.email == "ada@example.com"))
        assert db.scalar(select(SavedSearch).where(SavedSearch.user_id == user.id)).last_alerted_at


def test_alerts_off_or_inactive_students_get_nothing(client: TestClient, db_factory, ada):
    create(client, ada)  # alert off
    seed(db_factory, make_opportunity(title="Python Intern", description="Python"))
    with db_factory() as db:
        smtp = FakeSMTP()
        assert alerts.run(db, SETTINGS, send=True, smtp=smtp)["searches"] == 0
        assert smtp.sent == []


def test_cli_refuses_to_send_without_smtp(monkeypatch, capsys):
    monkeypatch.setattr(alerts, "get_settings", lambda: Settings(smtp_host=""))
    assert alerts.main(["--send"]) == 2
    assert "not configured" in capsys.readouterr().err
