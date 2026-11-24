"""Health endpoint tests and standard error shape checks."""

from opportunity_api.core.errors import ErrorResponse


def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db_returns_ok(client):
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_route_returns_standard_error_model(client):
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert ErrorResponse.model_validate(body)
    assert body["error"]["code"] == "not_found"
    assert body["error"]["details"] is None


def test_engine_options_are_pooler_and_serverless_safe():
    from opportunity_api.core.database import engine_options

    hosted = engine_options(
        "postgresql+psycopg://u:p@pooler.example.invalid:6543/db", serverless=True
    )
    assert hosted["connect_args"] == {"prepare_threshold": None}
    assert hosted["pool_size"] == 2 and hosted["pool_recycle"] < 300
    local = engine_options("sqlite://", serverless=False)
    assert "connect_args" not in local and "pool_size" not in local


def test_vercel_entrypoint_exposes_the_app():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "api" / "index.py"
    spec = importlib.util.spec_from_file_location("vercel_index", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from fastapi.testclient import TestClient

    assert TestClient(module.app).get("/health").json() == {"status": "ok"}
