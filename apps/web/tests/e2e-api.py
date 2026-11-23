"""Loopback-only E2E API with synthetic SQLite data; never connects to hosted Supabase."""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

import uvicorn
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool


def serve(database_url: URL) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api" / "src"))
    os.environ["DATABASE_URL"] = database_url.render_as_string(hide_password=False)
    os.environ["APP_SUPABASE_URL"] = "http://127.0.0.1:8300"
    # Publicly documented fixture key, valid only for this disposable loopback test service.
    os.environ["APP_SUPABASE_JWT_SECRET"] = "local-e2e-fixture-signing-key-only-0000"
    os.environ["APP_RATE_LIMIT_PER_MINUTE"] = "0"
    os.environ["APP_OLLAMA_URL"] = ""

    from opportunity_api.core.database import Base, get_db
    from opportunity_api.main import create_app
    from opportunity_api.models import Opportunity, OpportunityType

    # Jobs makes parallel API requests even with a single Playwright worker.
    engine = create_engine(database_url, poolclass=NullPool)
    try:
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with Session.begin() as db:
            for index, title in enumerate(
                ["Python Engineering Intern", "Research Intern", "Data Science Intern"], 1
            ):
                db.add(
                    Opportunity(
                        id=UUID(int=index),
                        title=title,
                        description="Synthetic integration fixture.",
                        organization="E2E Fixture",
                        opportunity_type=OpportunityType.internship,
                        location="Remote",
                        url=f"https://example.invalid/fixture/{index}",
                        source="e2e-fixture",
                        source_id=str(index),
                        is_active=True,
                    )
                )

        app = create_app()

        def test_db():
            with Session() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        uvicorn.run(app, host="127.0.0.1", port=8302, log_level="warning")
    finally:
        engine.dispose()


if __name__ == "__main__":
    with TemporaryDirectory(prefix="interncalling-e2e-") as directory:
        serve(URL.create("sqlite", database=str(Path(directory) / "e2e.sqlite3")))
