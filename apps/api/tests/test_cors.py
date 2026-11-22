"""Configuration rejection and real ASGI CORS authorization regressions."""

import pytest
from pydantic import ValidationError

from opportunity_api.core.config import Settings, get_settings
from opportunity_api.main import create_app


def settings(value):
    return Settings(_env_file=None, CORS_ORIGINS=value)


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "https://*.example.com",
        "null",
        "https://app.example.com/",
        "https://app.example.com/path",
        "https://app.example.com?",
        "https://app.example.com#",
        "https://synthetic:invalid-only@app.example.com",
        "https://@app.example.com",
        "https://app.example.com:0",
        "https://app.example.com:65536",
        "https://app.example.com:bad",
        "http://app.example.com",
        "http://localhost.example.com",
        "http://0.0.0.0:3000",
        "http://[::]:3000",
        "ftp://app.example.com",
        "https://app.example.com,",
        "https://app.example.com,,https://other.example.com",
        "https://bad host.example.com",
        "https://app.example.com\nhttps://other.example.com",
        "https://app.example.com\\other",
        "https://%65xample.com",
        "https://-bad.example.com",
    ],
)
def test_unsafe_origins_are_rejected_without_echoing_credentials(value):
    with pytest.raises(ValidationError) as error:
        settings(value)
    assert "CORS origins must be exact" in str(error.value)
    assert "invalid-only" not in str(error.value)


def test_exact_origins_normalize_deduplicate_and_allow_local_development():
    config = settings(
        " HTTPS://APP.EXAMPLE.COM:443 ,https://app.example.com,"
        "http://localhost:3000,http://127.0.0.1:3000,http://[::1]:3000"
    )
    assert config.cors_origin_list == [
        "https://app.example.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
    ]
    assert settings(" ").cors_origin_list == []


@pytest.fixture()
def cors_client(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com,http://localhost:3000")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            yield client
    finally:
        get_settings.cache_clear()


def test_allowed_preflight_and_credentialed_request_use_exact_origin(cors_client):
    headers = {
        "Origin": "https://app.example.com",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization,content-type",
    }
    response = cors_client.options("/api/v1/profile", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://app.example.com"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "Origin" in response.headers["vary"]
    response = cors_client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.parametrize(
    "origin",
    [
        "https://attacker.example.com",
        "null",
        "https://app.example.com.attacker.invalid",
        "http://app.example.com",
    ],
)
def test_denied_origins_never_receive_browser_access(cors_client, origin):
    response = cors_client.options(
        "/api/v1/profile", headers={"Origin": origin, "Access-Control-Request-Method": "PATCH"}
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    response = cors_client.get("/health", headers={"Origin": origin})
    assert response.status_code == 200  # CORS controls browsers, not public endpoint access.
    assert "access-control-allow-origin" not in response.headers


def test_wildcard_configuration_prevents_app_startup(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "*")
    get_settings.cache_clear()
    try:
        with pytest.raises(ValidationError):
            create_app()
    finally:
        get_settings.cache_clear()
