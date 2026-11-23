"""Loopback-only E2E API with synthetic SQLite data; never connects to hosted Supabase."""

import os
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "api" / "src"))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_SUPABASE_URL"] = "http://127.0.0.1:8300"
# Publicly documented fixture key, valid only for this disposable loopback test service.
os.environ["APP_SUPABASE_JWT_SECRET"] = "local-e2e-fixture-signing-key-only-0000"
os.environ["APP_RATE_LIMIT_PER_MINUTE"] = "0"
os.environ["APP_OLLAMA_URL"] = ""
os.environ["APP_SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_local_e2e_fixture"

import uvicorn
from opportunity_api.core.database import Base, get_db
from opportunity_api.main import create_app
from opportunity_api.models import Opportunity, OpportunityType
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
with Session() as db:
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
    db.commit()

app = create_app()

# Synthetic private Storage transport, injected only into this loopback fixture.
from opportunity_api.api.cv import get_storage
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
    from io import BytesIO
    from fastapi import Response
    from reportlab.pdfgen.canvas import Canvas
    buffer = BytesIO()
    canvas = Canvas(buffer)
    canvas.drawString(60, 760, "Synthetic fixture resume: Python research")
    canvas.save()
    return Response(buffer.getvalue(), media_type="application/pdf")




def test_db():
    with Session() as db:
        yield db


app.dependency_overrides[get_db] = test_db
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8302, log_level="warning")
