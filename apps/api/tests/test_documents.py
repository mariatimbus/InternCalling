"""ATS check and tailored CV / cover letter (LaTeX to PDF) for one job."""

import os
import shutil
from uuid import uuid4

import pytest

from opportunity_api.documents import content, latex
from opportunity_api.documents.content import Candidate, Entry
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile
from tests.conftest import auth_headers
from tests.test_opportunities import make_opportunity, seed

BASE = "/api/v1/workspace"
POSTING = MatchingOpportunity(
    title="Backend Software Intern",
    description="You have 2+ years of experience with Python and Docker. Bachelor students.",
    degree_level="bachelor",
)


def student() -> tuple[Candidate, MatchingProfile]:
    job = Entry(
        id="e1",
        title="Developer",
        subtitle="Acme",
        start="2023-01",
        finish="2024-01",
        lines=["Built Python APIs", "Ran tests in CI"],
    )
    pet = Entry(id="p1", title="Chess app", lines=["React front end"])
    candidate = Candidate(
        name="Ana Pop",
        email="ana@example.invalid",
        education="Bachelor's · Computer Science",
        school="University of Bucharest",
        skills=["Python", "React"],
        experience=[job],
        projects=[pet],
    )
    profile = MatchingProfile(
        skills=["python", "react"], field_of_study="Computer Science", degree_level="bachelor"
    )
    return candidate, profile


def test_text_is_escaped_so_no_input_runs_latex():
    hostile = r"\input{/etc/passwd} 100% $x$ a_b #1 ~ ^ {}"
    out = latex.tex(hostile)
    assert "\\input" not in out and "\\textbackslash{}input" in out
    for char in "%$_#{}":
        assert "\\" + char in out
    source = latex.resume_source(
        {
            "name": hostile,
            "contact": [hostile],
            "summary": hostile,
            "education": [],
            "experience": [
                {
                    "title": hostile,
                    "subtitle": "",
                    "where": "",
                    "when": "",
                    "bullets": ["[label] " + hostile],
                }
            ],
            "projects": [],
            "skills": [hostile],
            "extras": [("Awards", [hostile])],
        }
    )
    assert "\\input{" not in source
    assert "\\item{} [label]" in source  # a leading "[" is never an \item option


def test_ats_report_rows_and_added_keywords(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    report = content.ats_report(candidate, profile, POSTING, [])
    rows = {r.key: r for r in report.rows}
    assert (rows["keywords"].matched, rows["keywords"].missing) == (["Python"], ["Docker"])
    assert (rows["experience"].job, rows["experience"].you) == ("2+ years", "1 years")
    assert rows["experience"].status == "partial"
    assert rows["education"].status == rows["title"].status == "met"
    # Adding a keyword puts it in the CV, so it counts and the score goes up.
    more = content.ats_report(candidate, profile, POSTING, ["docker", "Kubernetes"])
    keywords = next(r for r in more.rows if r.key == "keywords")
    assert keywords.label == "ATS keywords (3/3)" and keywords.missing == []
    assert more.score > report.score


def test_phrases_match_by_their_words():
    corpus = "Built Python APIs\nFluent in English (C1)"
    assert content.has_keyword("REST APIs", set(), corpus + " REST")
    assert content.has_keyword("Fluent English", set(), corpus)
    assert not content.has_keyword("GraphQL APIs", set(), corpus)
    assert content.has_keyword("back end", set(), "Backend developer")


def test_employer_and_place_are_not_keywords(monkeypatch):
    class Writer:
        def generate_json(self, model, system, prompt, schema, temperature=0):
            return schema(keywords=["NXP", "Sibiu", "Angular"])

    monkeypatch.setattr(content, "_writer", lambda: Writer())
    content._model_keywords.cache_clear()
    posting = MatchingOpportunity(
        title="Web Intern",
        description="Join NXP in Sibiu to build Angular apps.",
        location="Sibiu, Romania",
    )
    assert content.posting_keywords(posting, "NXP Semiconductors") == ["Angular"]
    content._model_keywords.cache_clear()


def test_model_keywords_must_appear_in_the_posting(monkeypatch):
    class Writer:
        def generate_json(self, model, system, prompt, schema, temperature=0):
            return schema(keywords=["Kubernetes", "teamwork", "Rust", "models", "Backend"])

    monkeypatch.setattr(content, "_writer", lambda: Writer())
    content._model_keywords.cache_clear()
    posting = MatchingOpportunity(
        title="Backend Intern", description="Kubernetes, Python, teamwork and ML models."
    )
    # Not in the text (Rust), generic (models) or the job title (Backend) are dropped.
    assert content.posting_keywords(posting) == [
        "Kubernetes",
        "Machine learning",
        "Python",
        "Teamwork",
    ]
    content._model_keywords.cache_clear()


def test_resume_without_a_model_uses_saved_facts(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    doc, by_model = content.resume_document(candidate, POSTING, "Acme", ["Kubernetes"], profile)
    assert not by_model
    # Matched posting keywords, then the student's own keyword, then other skills.
    assert doc["skills"] == ["Python", "Kubernetes", "React"]  # student's spelling, no repeats
    assert doc["experience"][0]["bullets"] == ["Built Python APIs", "Ran tests in CI"]
    assert "Python" in latex.resume_source(doc)


def test_model_output_cannot_add_entries_or_skills(monkeypatch):
    class Writer:
        def generate_json(self, model, system, prompt, schema, temperature=0):
            return schema(
                summary="Backend-minded student who builds and tests Python services.",
                skills=["Rust", "python"],
                entries=[
                    {"id": "e1", "bullets": ["Built and tested Python APIs"]},
                    {"id": "invented", "bullets": ["CTO at Google"]},
                ],
            )

    monkeypatch.setattr(content, "_writer", lambda: Writer())
    candidate, profile = student()
    doc, by_model = content.resume_document(candidate, POSTING, "Acme", [], profile)
    assert by_model
    assert "Rust" not in doc["skills"] and doc["skills"][0] == "Python"
    assert doc["experience"][0]["bullets"] == ["Built and tested Python APIs"]
    assert "CTO at Google" not in str(doc)


def test_cover_letter_without_a_model(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    doc, by_model = content.letter_document(candidate, POSTING, "Acme", [], profile)
    assert not by_model and len(doc["paragraphs"]) == 4
    assert "Backend Software Intern position at Acme" in doc["paragraphs"][0]
    assert "Developer (Acme)" in doc["paragraphs"][1]
    assert "Dear Hiring Team" in latex.letter_source(doc)


def test_endpoints_need_a_user_and_return_report_and_pdf(client, db_factory, monkeypatch):
    job = make_opportunity(title="Python Intern", description="Python and SQL.")
    seed(db_factory, job)
    url = f"{BASE}/ats/{job.id}"
    assert client.post(url, json={}).status_code == 401
    headers = auth_headers(client, "ats@example.invalid")
    client.put("/api/v1/profile/skills", headers=headers, json={"names": ["python"]})
    added = client.post(
        BASE + "/collections/experience",
        headers={**headers, "Idempotency-Key": str(uuid4())},
        json={
            "values": {
                "role": "Intern",
                "organization": "Acme",
                "startDate": "2024",
                "current": True,
                "achievements": "Wrote SQL reports",
            }
        },
    )
    assert added.status_code == 201, added.text
    monkeypatch.setattr(content, "_writer", lambda: None)
    report = client.post(url, headers=headers, json={"keywords": ["Excel"]}).json()
    keywords = next(r for r in report["rows"] if r["key"] == "keywords")
    assert keywords["matched"] == ["Python", "SQL", "Excel"] and keywords["missing"] == []
    assert client.post(url, headers=headers, json={"keywords": ["x" * 61]}).status_code == 422

    sources = []
    monkeypatch.setattr(latex, "compile_pdf", lambda s: sources.append(s) or b"%PDF-1.7 test")
    for kind in ("resume", "cover-letter"):
        response = client.post(f"{BASE}/documents/{job.id}/{kind}", headers=headers, json={})
        assert response.status_code == 200, response.text
        assert response.content.startswith(b"%PDF")
        assert response.headers["content-disposition"] == f'attachment; filename="{kind}.pdf"'
    assert "Wrote SQL reports" in sources[0] and "Python Intern" in sources[1]
    bad = client.post(f"{BASE}/documents/{job.id}/essay", headers=headers, json={})
    assert bad.status_code == 422


@pytest.mark.skipif(
    not (os.environ.get("APP_TECTONIC_TEST") or shutil.which("tectonic")),
    reason="set APP_TECTONIC_TEST=1 to download Tectonic and compile real PDFs",
)
def test_templates_compile_to_pdf(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    candidate.languages, candidate.certificates = ["Română (Native)"], ["AWS & Co, 50% off"]
    resume, _ = content.resume_document(candidate, POSTING, "Acme", [], profile)
    letter, _ = content.letter_document(candidate, POSTING, "Acme", [], profile)
    for source in (latex.resume_source(resume), latex.letter_source(letter)):
        assert latex.compile_pdf(source).startswith(b"%PDF")


def test_skills_print_once_with_readable_capitals():
    names = ["python", "docker", "Docker", "sql", "PostgreSQL", "k8s", "kubernetes"]
    assert content._unique(names) == ["Python", "Docker", "SQL", "PostgreSQL", "K8s"]
