"""Loopback-only E2E API with synthetic SQLite data; never connects to hosted Supabase."""

import os
import sys
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

import uvicorn
from fastapi import Response
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy import URL, create_engine, event
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

    os.environ["APP_SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_local_e2e_fixture"

    from opportunity_api.api.cv import get_storage
    from opportunity_api.core.database import Base, get_db
    from opportunity_api.main import create_app
    from opportunity_api.models import Opportunity, OpportunityType

    # Jobs makes parallel API requests even with a single Playwright worker.
    engine = create_engine(database_url, connect_args={"timeout": 30}, poolclass=NullPool)

    @event.listens_for(engine, "connect")
    def set_busy_timeout(connection, _record):
        connection.execute("PRAGMA busy_timeout=30000")

    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
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
                        description=(
                            "Synthetic integration fixture.\n"
                            "About the role\n"
                            "Join a small engineering team to build accessible tools for students. "
                            "Collaborate with designers and engineers throughout delivery.\n"
                            "Responsibilities\n"
                            "• Development: Build clear interfaces and maintain existing features.\n"
                            "• Testing: Check edge cases and document reproducible issues.\n"
                            "• Collaboration: Explain decisions and review changes with the team.\n"
                            "• Accessibility: Support keyboard use and readable content.\n"
                            "• Quality: Validate API responses and preserve user input on errors.\n"
                            "Qualifications\n"
                            "• Currently enrolled in a relevant degree programme.\n"
                            "• Comfortable reading documentation and asking clear questions.\n"
                            "• Interested in practical software engineering and user experience.\n"
                            "Benefits\n"
                            "• Regular feedback from the engineering team.\n"
                            "• Time to learn through practical work.\n"
                        ),
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

        # Synthetic private Storage transport, injected only into this loopback fixture.
        class FixtureStorage:
            files = {}
            def upload(self, path, data, media_type):
                self.files[path] = data
            def download(self, path):
                return self.files[path]
            def delete(self, path):
                self.files.pop(path, None)
        app.dependency_overrides[get_storage] = FixtureStorage
        @app.get("/__test/resume.pdf")
        def fixture_pdf():
            buffer = BytesIO()
            canvas = Canvas(buffer)
            canvas.drawString(60, 760, "Synthetic fixture resume: Python research")
            canvas.save()
            return Response(buffer.getvalue(), media_type="application/pdf")

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
