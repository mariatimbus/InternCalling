"""Curated summaries are replaced by the official posting's full text."""

import json
from datetime import date

from opportunity_api.ingestion import full_text
from opportunity_api.models.opportunity import Opportunity, OpportunityType

WORDS = " ".join(f"word{i}" for i in range(150))


class FakeClient:
    def __init__(self, responses):
        self.responses, self.calls = responses, []

    def get(self, url):
        self.calls.append(url)
        value = self.responses[url]
        if isinstance(value, Exception):
            raise value
        return value

    get_text = get


def test_pages_are_read_from_json_ld_sections_or_main():
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Organization"},
            {
                "@type": "JobPosting",
                "description": "&lt;p&gt;Build &amp; ship&lt;/p&gt;<ul><li>Go</li></ul>",
            },
        ],
    }
    page = f'<script type="application/ld+json">{json.dumps(ld)}</script><main>ignored</main>'
    assert full_text.from_page(page) == ("json-ld", "Build & ship\n• Go")
    amazon = (
        '<div class="section description"><h2>Description</h2><p>Solve problems</p></div>'
        '<div class="section"><h2>Basic Qualifications</h2><p>- Enrolled in CS</p></div>'
    )
    method, text = full_text.from_page(amazon)
    assert (
        method == "sections"
        and text == "Description\nSolve problems\nBasic Qualifications\n- Enrolled in CS"
    )
    page = "<nav>Menu</nav><main><h1>Internship</h1><p>Apply by May</p><footer>x</footer></main>"
    assert full_text.from_page(page) == ("main", "Internship\nApply by May")


def test_ats_urls_use_their_public_apis():
    client = FakeClient(
        {
            "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/1": {
                "content": "&lt;p&gt;Hi&lt;/p&gt;"
            },
            "https://api.lever.co/v0/postings/quantco-/" + "a" * 36: {
                "description": "<p>About</p>",
                "lists": [{"text": "You have", "content": "<li>Python</li>"}],
                "additional": "<p>Benefits</p>",
            },
            "https://api.ashbyhq.com/posting-api/job-board/sentry": {
                "jobs": [{"id": "b" * 36, "descriptionHtml": "<p>Sentry</p>"}]
            },
            "https://q.wd12.myworkdayjobs.com/wday/cxs/q/External/job/Intern_1": {
                "jobPostingInfo": {"jobDescription": "<p>Workday</p>"}
            },
        }
    )
    assert full_text.fetch("https://job-boards.greenhouse.io/cloudflare/jobs/1", client) == (
        "greenhouse",
        "Hi",
    )
    lever = full_text.fetch(f"https://jobs.lever.co/quantco-/{'a' * 36}/apply", client)
    assert lever == ("lever", "About\nYou have\n• Python\nBenefits")
    assert full_text.fetch(f"https://jobs.ashbyhq.com/sentry/{'b' * 36}", client) == (
        "ashby",
        "Sentry",
    )
    workday = "https://q.wd12.myworkdayjobs.com/en-US/External/job/Intern_1"
    assert full_text.fetch(workday, client) == ("workday", "Workday")


def _row(
    db_factory,
    url,
    description="Short summary.\nOfficial source: x\nSource last checked: 2026-11-04.",
):
    row = Opportunity(
        title="Intern",
        organization="Co",
        url=url,
        description=description,
        source=full_text.CURATED_SOURCE,
        source_id=url,
        opportunity_type=OpportunityType.internship,
        is_active=True,
    )
    with db_factory() as session:
        session.add(row)
        session.commit()
        return row.id


def test_refresh_writes_only_trusted_text_and_is_repeatable(db_factory):
    good = _row(db_factory, "https://good.example/job")
    thin = _row(db_factory, "https://thin.example/job")
    down = _row(db_factory, "https://down.example/job")
    client = FakeClient(
        {
            "https://good.example/job": f"<main><p>{WORDS}</p></main>",
            "https://thin.example/job": "<main><p>Too short</p></main>",
            "https://down.example/job": ValueError("robots policy disallows public endpoint"),
        }
    )
    with db_factory() as session:
        dry = full_text.refresh(session, client, apply=False, today=date(2026, 11, 25))
    assert {r["url"]: r["status"] for r in dry} == {
        "https://good.example/job": "would update",
        "https://thin.example/job": "skipped",
        "https://down.example/job": "skipped",
    }
    with db_factory() as session:
        assert session.get(Opportunity, good).description.startswith("Short summary.")
    for _ in range(2):
        with db_factory() as session:
            report = full_text.refresh(session, client, apply=True, today=date(2026, 11, 25))
    assert {r["url"]: r["status"] for r in report}["https://good.example/job"] == "updated"
    with db_factory() as session:
        text = session.get(Opportunity, good).description
        assert text.startswith("word0") and text.count("Official source:") == 1
        assert text.endswith(
            "Official source: https://good.example/job\nSource last checked: 2026-11-25."
        )
        assert session.get(Opportunity, thin).description.startswith("Short summary.")
        assert session.get(Opportunity, down).description.startswith("Short summary.")
