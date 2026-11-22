"""Offline C5 inputs: real saved ATS responses and disposable configuration."""

import copy
import json
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from opportunity_api.core.database import Base
from opportunity_api.ingestion.sources.employers import Employer

FIXTURES = Path(__file__).parent / "fixtures" / "ats"
PROVIDERS = ("greenhouse", "lever", "smartrecruiters")


def configuration(tmp_path, *, switches=None, disabled_company=None):
    providers = tmp_path / "providers.json"
    employers = tmp_path / "employers.json"
    providers.write_text(json.dumps(switches or dict.fromkeys(PROVIDERS, True)))
    employers.write_text(
        json.dumps(
            [
                Employer(
                    name=provider,
                    provider=provider,
                    identifier="fixture",
                    careers_url="https://example.invalid/careers",
                    enabled=provider != disabled_company,
                ).model_dump(mode="json")
                for provider in PROVIDERS
            ]
        )
    )
    return providers, employers


class FixtureClient:
    def __init__(self, *, broken=None, mixed=False, changed=False):
        self.broken, self.mixed, self.changed = broken, mixed, changed
        self.calls = []

    def get(self, url):
        self.calls.append(url)
        provider = next(p for p in PROVIDERS if p in urlsplit(url).hostname)
        if provider == self.broken:
            raise TimeoutError("private-sentinel: never report raw exception text")
        payload = json.loads((FIXTURES / f"{provider}_success.json").read_text())
        if provider == "smartrecruiters":
            if urlsplit(url).path.endswith("/postings"):
                return {"content": [{"id": payload["id"]}], "totalFound": 1}
            return payload
        if provider == "greenhouse":
            row = payload["jobs"][0]
            if self.changed:
                row["title"] = "Software Engineering Intern - Updated"
                row["absolute_url"] += "&language=en"
            if self.mixed:
                senior = dict(
                    row,
                    id="senior",
                    title="Senior Software Engineer",
                    absolute_url="https://example.invalid/jobs/senior",
                )
                invalid = dict(
                    row,
                    id="invalid",
                    absolute_url="https://example.invalid/jobs/bad?api_key=private-sentinel",
                )
                review = dict(
                    row,
                    id="review",
                    location={"name": "Remote"},
                    absolute_url="https://example.invalid/jobs/review",
                )
                payload["jobs"] += [copy.deepcopy(row), senior, invalid, review]
        return payload


def local_database(tmp_path):
    path = tmp_path / "catalogue.sqlite"
    engine = create_engine("sqlite:///" + str(path))

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    return engine, "sqlite:///" + str(path)


def snapshot(engine):
    from sqlalchemy import text

    with Session(engine) as session:
        return {
            table: session.execute(text(f"SELECT * FROM {table} ORDER BY id")).all()
            for table in ("opportunities", "applications", "users")
        }
