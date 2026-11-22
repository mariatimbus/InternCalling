"""Recovered developer console remains opt-in and only returns public config."""

import pytest
from fastapi.testclient import TestClient

from opportunity_api.core.config import get_settings
from opportunity_api.main import create_app


@pytest.fixture
def console(monkeypatch):
    def client(
        *, debug, key="sb_publishable_synthetic_console_only", url="https://console.example.invalid"
    ):
        monkeypatch.setenv("APP_DEBUG", str(debug).lower())
        monkeypatch.setenv("APP_SUPABASE_PUBLISHABLE_KEY", key)
        monkeypatch.setenv("APP_SUPABASE_URL", url)
        get_settings.cache_clear()
        return TestClient(create_app())

    yield client
    get_settings.cache_clear()


def test_console_and_configuration_are_not_routes_in_production(console):
    with console(debug=False) as client:
        assert client.get("/dev/console").status_code == 404
        assert client.get("/dev/config").status_code == 404


def test_debug_console_has_only_browser_safe_configuration(console):
    with console(debug=True) as client:
        assert client.get("/dev/console").status_code == 200
        assert client.get("/dev/config").json() == {
            "supabase_url": "https://console.example.invalid",
            "publishable_key": "sb_publishable_synthetic_console_only",
        }


@pytest.mark.parametrize("key", ["", "invalid-key", "sb_secret_synthetic_invalid_only"])
def test_privileged_or_invalid_key_is_not_returned(console, key):
    with console(debug=True, key=key) as client:
        response = client.get("/dev/config")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "configuration_unavailable"
        assert "publishable_key" not in response.text


@pytest.mark.parametrize("url", ["https://synthetic@example.invalid", "https://[invalid"])
def test_credential_bearing_project_url_is_not_returned(console, url):
    with console(debug=True, url=url) as client:
        response = client.get("/dev/config")
        assert response.status_code == 503
        assert "synthetic" not in response.text
