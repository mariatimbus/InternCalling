"""JSON-lines adapter to the real FastAPI app; exclusively in-memory test data."""

import json
import os
import sys
from datetime import UTC, datetime, timedelta
from uuid import UUID

# Override configuration before importing the app. No shared database/network services.
os.environ.update(
    DATABASE_URL="sqlite://",
    APP_DATABASE_URL="sqlite://",
    APP_SUPABASE_URL="https://matching-fixture.supabase.co",
    APP_SUPABASE_JWT_SECRET="synthetic-matching-fixture-key-not-a-real-secret",
    APP_OLLAMA_URL="",
    APP_RATE_LIMIT_PER_MINUTE="0",
)

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from opportunity_api.api import opportunities  # noqa: E402
from opportunity_api.core.database import Base, get_db  # noqa: E402
from opportunity_api.main import create_app  # noqa: E402
from opportunity_api.models import Opportunity, Skill  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
app = create_app()


def isolated_db():
    with Session(engine) as session:
        yield session


app.dependency_overrides[get_db] = isolated_db
observed = []
real_score = opportunities.score_match


def observe(profile, opportunity, *, ai=None):
    observed.append(profile.model_dump(mode="json"))
    return real_score(profile, opportunity, ai=ai)


opportunities.score_match = observe
with Session(engine) as session:
    python = Skill(name="python")
    session.add_all([
        Opportunity(
            title="Python Computing Internship", description="Python Computing in Berlin",
            opportunity_type="internship", location="Berlin", degree_level="both",
            url="https://example.invalid/matching-internship", source="synthetic", source_id="one",
            skills=[python], is_active=True,
        ),
        Opportunity(
            title="Unrelated Research", opportunity_type="research", location="Remote",
            url="https://example.invalid/matching-research", source="synthetic", source_id="two",
            is_active=True,
        ),
    ])
    session.commit()

now = datetime.now(UTC)
token = jwt.encode({
    "sub": str(UUID("00000000-0000-4000-8000-000000000123")),
    "email": "matching@example.invalid", "aud": "authenticated",
    "iss": os.environ["APP_SUPABASE_URL"] + "/auth/v1",
    "iat": now, "exp": now + timedelta(hours=1),
}, os.environ["APP_SUPABASE_JWT_SECRET"], algorithm="HS256")
try:
    with TestClient(app) as client:
        for line in sys.stdin:
            try:
                command = json.loads(line)
                if command.get("op") == "trace":
                    result = {"observed": observed}
                else:
                    response = client.request(
                        command.get("method", "GET"), command["path"],
                        json=command.get("body"), headers={"Authorization": "Bearer " + token},
                    )
                    result = {"status": response.status_code, "body": response.json()}
                print(json.dumps(result), flush=True)
            except Exception:
                print(json.dumps({"fixture_error": "isolated backend request failed"}), flush=True)
finally:
    engine.dispose()
