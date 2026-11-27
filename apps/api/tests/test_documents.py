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
    assert "\\input{/etc" not in source and "\\textbackslash{}input" in source
    assert "\\resumeItem{[label]" in source  # inside braces, "[" is never an \item option


def test_ats_report_rows_and_added_keywords(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    report = content.ats_report(candidate, profile, POSTING, [])
    rows = {r.key: r for r in report.rows}
    assert (rows["keywords"].matched, rows["keywords"].missing) == (["Python"], ["Docker"])
    assert (rows["experience"].job, rows["experience"].you) == (
        "2+ years",
        "1 year of industry experience (1 role)",
    )
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
    candidate.activities = [
        Entry(id="r", kind="research", title="Research Assistant", lines=["Built a 1D-CNN"]),
        Entry(id="t", kind="extracurricular", title="Team Leader", subtitle="Robotics & Co"),
    ]
    candidate.links = [("GitHub", "https://github.com/ana?tab=repos&x=1#top")]
    candidate.projects = [
        Entry(
            id="p",
            title="Solver",
            where="Python",
            links=[("Code", "https://github.com/ana/solver")],
        )
    ]
    resume, _ = content.resume_document(candidate, POSTING, "Acme", [], profile)
    letter, _ = content.letter_document(candidate, POSTING, "Acme", [], profile)
    for source in (latex.resume_source(resume), latex.letter_source(letter)):
        assert latex.compile_pdf(source).startswith(b"%PDF")


def test_skills_print_once_with_readable_capitals():
    names = ["python", "docker", "Docker", "sql", "PostgreSQL", "k8s", "kubernetes"]
    assert content._unique(names) == ["Python", "Docker", "SQL", "PostgreSQL", "K8s"]


def test_overlapping_roles_count_once():
    roles = [
        Entry(id="a", title="Team Leader", start="2021-09", finish="2025-08"),
        Entry(id="b", title="Research Assistant", start="2023-09", finish="2025-10"),
        Entry(id="c", title="Mentor", start="2022", finish="2022-06"),
    ]
    assert content._years(roles) == 4.1  # Sep 2021 to Oct 2025, not 4 + 2 + 0.4


def test_word_forms_match_and_the_closest_role_is_shown(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    assert content.has_keyword("Automation", set(), "Built automated deploys")
    assert content.has_keyword("Regression testing", set(), "Wrote regression tests")
    candidate, profile = student()
    candidate.experience.insert(0, Entry(id="x", title="Barista", subtitle="Cafe"))
    job = MatchingOpportunity(title="Python Developer Intern", description="Python APIs.")
    title = next(
        r for r in content.ats_report(candidate, profile, job, []).rows if r.key == "title"
    )
    assert title.you == "Developer · Acme"  # the role that shares words with the job title


@pytest.mark.parametrize(
    "role,organization,kind",
    [
        ("Team Leader", "Quantum Robotics FTC", "extracurricular"),
        ("Web & Communications Member", "AlphaZ", "extracurricular"),
        ("Research Assistant", "Faculty of Physics, University of Bucharest", "research"),
        ("Research Intern", "Google DeepMind", "internship"),
        ("Software Engineering Intern", "Acme", "internship"),
        ("Volunteer Tutor", "Code Club", "volunteering"),
        ("Backend Engineer", "Acme", "job"),
    ],
)
def test_experience_type_is_read_from_role_and_organization(role, organization, kind):
    from opportunity_api.schemas.workspace import experience_type

    assert experience_type({"role": role, "organization": organization}) == kind
    assert experience_type({"role": role, "organization": organization, "type": "job"}) == "job"


def test_research_and_activities_are_not_industry_years(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    candidate.experience = []
    candidate.activities = [
        Entry(
            id="r", kind="research", title="Research Assistant", start="2023-09", finish="2025-10"
        ),
        Entry(
            id="t",
            kind="extracurricular",
            title="Team Leader",
            subtitle="Robotics FTC",
            start="2021-09",
            finish="2025-08",
            lines=["Led 15 students"],
        ),
    ]
    row = next(
        r for r in content.ats_report(candidate, profile, POSTING, []).rows if r.key == "experience"
    )
    assert row.you == "No industry experience yet · 2 research or activity roles"
    doc, _ = content.resume_document(candidate, POSTING, "Acme", [], profile)
    assert doc["experience"] == [] and doc["research"][0]["title"] == "Research Assistant"
    assert doc["activities"][0]["bullets"] == ["Led 15 students"]
    source = latex.resume_source(doc)
    assert "\\section{Research}" in source and "\\section{Leadership}" in source


def test_title_row_never_shows_an_unrelated_activity(monkeypatch):
    monkeypatch.setattr(content, "_writer", lambda: None)
    candidate, profile = student()
    candidate.experience = []
    candidate.activities = [
        Entry(
            id="a",
            kind="extracurricular",
            title="Web & Communications Member",
            lines=["Engineering team website"],
        )
    ]
    job = MatchingOpportunity(title="ICEYE Engineering Intern Lab 2027")
    title = next(
        r for r in content.ats_report(candidate, profile, job, []).rows if r.key == "title"
    )
    assert title.you == "Computer Science student"  # "intern" and "2027" are not shared words


def test_cv_uses_the_team_template_and_bolds_metrics():
    doc = {
        "name": "Ana Pop",
        "contact": ["ana@example.invalid", "Bucharest"],
        "education": [{"school": "Unibuc", "degree": "Bachelor's", "when": "Expected 2029"}],
        "experience": [],
        "research": [],
        "projects": [
            {
                "title": "Docs",
                "subtitle": "",
                "where": "Python",
                "when": "2026",
                "bullets": ["48 automated tests, 90%+ accuracy, 236K views"],
            }
        ],
        "activities": [],
        "skills": ["Python", "React"],
        "extras": [("Awards", ["NASA contest 2nd place"]), ("Languages", ["English (C1)"])],
    }
    source = latex.resume_source(doc)
    assert "\\resumeSubheading" in source and "\\section{Technical Skills}" in source
    assert "\\textbf{Languages}: Python" in source and "\\textbf{Technologies}: React" in source
    assert "\\textbf{Honors}: NASA contest 2nd place" in source
    assert "\\textbf{48} automated tests, \\textbf{90\\%+} accuracy, \\textbf{236K} views" in source
    assert "\\href{mailto:ana@example.invalid}" in source
    assert content._unique(["javascript", "Github actions", "sql"]) == [
        "JavaScript",
        "GitHub Actions",
        "SQL",
    ]


def test_cv_links_profiles_projects_and_credentials():
    assert content.https_url("https://github.com/ana") == "https://github.com/ana"
    for bad in (
        "http://github.com/ana",
        "javascript:alert(1)",
        "https://u:p@x.com",
        "https://x/{a}",
    ):
        assert content.https_url(bad) == ""
    doc = {
        "name": "Ana",
        "contact": ["ana@example.invalid"],
        "links": [
            ("LinkedIn", "https://www.linkedin.com/in/ana/"),
            ("GitHub", "https://github.com/ana"),
        ],
        "urls": {"AWS Practitioner, Amazon": "https://aws.example/cert?id=1&x=2"},
        "education": [],
        "experience": [],
        "research": [],
        "activities": [],
        "skills": [],
        "projects": [
            {
                "title": "Solver",
                "subtitle": "",
                "where": "Python",
                "when": "2026",
                "bullets": [],
                "links": [("Code", "https://github.com/ana/solver")],
            }
        ],
        "extras": [("Certificates", ["AWS Practitioner, Amazon"])],
    }
    source = latex.resume_source(doc)
    assert "\\href{https://www.linkedin.com/in/ana/}{\\underline{linkedin.com/in/ana}}" in source
    assert "\\href{https://github.com/ana/solver}{\\underline{Code}}" in source
    assert (
        "\\href{https://aws.example/cert?id=1\\&x=2}{\\underline{AWS Practitioner, Amazon}}"
        in source
    )


def test_profile_links_come_from_the_verified_token(client, db_factory, monkeypatch):
    from tests.conftest import mint_token

    job = make_opportunity(title="Python Intern", description="Python.")
    seed(db_factory, job)
    token = mint_token(
        email="links@example.invalid",
        user_metadata={
            "full_name": "Ana Pop",
            "profile_linkedin_url": "https://www.linkedin.com/in/ana",
            "profile_github_url": "https://evil.example/ana",  # not GitHub: never printed
        },
    )
    sources = []
    monkeypatch.setattr(content, "_writer", lambda: None)
    monkeypatch.setattr(latex, "compile_pdf", lambda s: sources.append(s) or b"%PDF-1.7")
    response = client.post(
        f"{BASE}/documents/{job.id}/resume", headers={"Authorization": f"Bearer {token}"}, json={}
    )
    assert response.status_code == 200, response.text
    assert "linkedin.com/in/ana" in sources[0] and "evil.example" not in sources[0]


def test_model_bullets_must_restate_the_entrys_own_facts(monkeypatch):
    class Writer:
        def generate_json(self, model, system, prompt, schema, temperature=0):
            return schema(
                summary="",
                skills=[],
                entries=[
                    {
                        "id": "e1",
                        "bullets": [
                            "Built Python APIs and ran their tests in CI",  # restates the facts
                            "Managed data storage and retrieval with SQL databases",  # invented
                            "Shipped 12 releases to production",  # invented number
                        ],
                    }
                ],
            )

    monkeypatch.setattr(content, "_writer", lambda: Writer())
    candidate, profile = student()
    doc, _ = content.resume_document(candidate, POSTING, "Acme", [], profile)
    assert doc["experience"][0]["bullets"] == ["Built Python APIs and ran their tests in CI"]

    class Inventor(Writer):
        def generate_json(self, model, system, prompt, schema, temperature=0):
            return schema(
                summary="",
                skills=[],
                entries=[{"id": "e1", "bullets": ["Demonstrated strong leadership capabilities"]}],
            )

    monkeypatch.setattr(content, "_writer", lambda: Inventor())
    doc, _ = content.resume_document(candidate, POSTING, "Acme", [], profile)
    assert doc["experience"][0]["bullets"] == [
        "Built Python APIs",
        "Ran tests in CI",
    ]  # saved wording
