"""Replace curated one-paragraph summaries with the official posting's full text.

Curated rows (Maria's verified shortlist) were imported with a short summary and the
official link. Matching, eligibility and the ATS check read the posting text, so this
fetches the real text from the official source, in this order:

1. the ATS's public API (Greenhouse, Lever, Ashby, Workday);
2. a schema.org ``JobPosting`` in the page;
3. headed description sections (amazon.jobs) or the page's ``<main>``.

Text under ``MIN_WORDS`` is not trusted and the row is left as it is. Re-running gives
the same result for an unchanged posting. Dry run by default; see ``main``.
"""

import argparse
import html
import json
import re
import sys
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.opportunity import Opportunity
from .database import explicit_database_url, ingestion_session
from .normalize import clean_html
from .sources.http import PublicJSONClient

CURATED_SOURCE = "maria_europe_master_2026_10_12"
MIN_WORDS = 120
OFFICIAL = re.compile(r"^(?:Official source|Source last checked):.*$", re.M)

_GREENHOUSE = re.compile(r"https://(?:job-boards|boards)\.greenhouse\.io/([^/]+)/jobs/(\d+)")
_LEVER = re.compile(r"https://jobs\.lever\.co/([^/]+)/([0-9a-f-]{36})")
_ASHBY = re.compile(r"https://jobs\.ashbyhq\.com/([^/]+)/([0-9a-f-]{36})")
_WORKDAY = re.compile(
    r"https://([^./]+)\.(wd\d+)\.myworkdayjobs\.com/(?:[a-z]{2}-[A-Z]{2}/)?([^/]+)/job/([^?#]+)"
)
_LD_JSON = re.compile(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)
_SECTION = re.compile(
    r'<div class="section[^"]*"[^>]*>\s*<h2[^>]*>(.*?)</h2>(.*?)</div>', re.S | re.I
)
_MAIN = re.compile(r"<main\b[^>]*>(.*?)</main>", re.S | re.I)
_CHROME = re.compile(r"<(nav|header|footer|form|aside)\b[^>]*>.*?</\1>", re.S | re.I)


def _job_postings(value):
    """Every schema.org JobPosting in a JSON-LD value (objects, lists, @graph)."""
    if isinstance(value, list):
        for item in value:
            yield from _job_postings(item)
    elif isinstance(value, dict):
        kind = value.get("@type")
        if kind == "JobPosting" or isinstance(kind, list) and "JobPosting" in kind:
            yield value
        yield from _job_postings(value.get("@graph"))


def from_page(page: str) -> tuple[str, str | None]:
    """(method, text) read from an HTML page."""
    for block in _LD_JSON.findall(page):
        try:
            data = json.loads(html.unescape(block) if "&quot;" in block else block)
        except ValueError:
            continue
        for posting in _job_postings(data):
            if isinstance(posting.get("description"), str):
                return "json-ld", clean_html(html.unescape(posting["description"]))
    sections = _SECTION.findall(page)
    if sections:
        parts = [f"{clean_html(title)}\n{clean_html(body) or ''}" for title, body in sections]
        return "sections", "\n".join(parts)
    main = _MAIN.search(_CHROME.sub(" ", page))
    return "main", clean_html(main[1]) if main else None


def fetch(url: str, client: PublicJSONClient) -> tuple[str, str | None]:
    """(method, plain text) for one official posting URL."""
    if m := _GREENHOUSE.match(url):
        data = client.get(f"https://boards-api.greenhouse.io/v1/boards/{m[1]}/jobs/{m[2]}")
        return "greenhouse", clean_html(data.get("content"))
    if m := _LEVER.match(url):
        data = client.get(f"https://api.lever.co/v0/postings/{m[1]}/{m[2]}")
        lists = "".join(
            f"<h3>{x.get('text', '')}</h3><ul>{x.get('content', '')}</ul>"
            for x in data.get("lists") or []
        )
        body = (data.get("description") or "") + lists + (data.get("additional") or "")
        return "lever", clean_html(body)
    if m := _ASHBY.match(url):
        board = client.get(f"https://api.ashbyhq.com/posting-api/job-board/{m[1]}")
        job = next((j for j in board.get("jobs") or [] if j.get("id") == m[2]), None)
        return "ashby", clean_html(job.get("descriptionHtml")) if job else None
    if m := _WORKDAY.match(url):
        data = client.get(
            f"https://{m[1]}.{m[2]}.myworkdayjobs.com/wday/cxs/{m[1]}/{m[3]}/job/{m[4]}"
        )
        return "workday", clean_html((data.get("jobPostingInfo") or {}).get("jobDescription"))
    return from_page(client.get_text(url))


def with_source(text: str, url: str, today: date) -> str:
    return f"{text}\n\nOfficial source: {url}\nSource last checked: {today.isoformat()}."


def refresh(session: Session, client: PublicJSONClient, *, apply: bool, today: date):
    """Fetch every active curated row; write only text that passes ``MIN_WORDS``."""
    rows = session.scalars(
        select(Opportunity)
        .where(Opportunity.source == CURATED_SOURCE, Opportunity.is_active)
        .order_by(Opportunity.organization, Opportunity.title)
    ).all()
    report = []
    for row in rows:
        entry = {"organization": row.organization, "title": row.title, "url": row.url}
        try:
            method, text = fetch(row.url, client)
        except Exception as exc:  # one unreachable site must not stop the others
            report.append({**entry, "status": "skipped", "reason": type(exc).__name__})
            continue
        words = len((text or "").split())
        entry.update(method=method, words=words)
        if words < MIN_WORDS:
            report.append({**entry, "status": "skipped", "reason": "too little text"})
            continue
        summary = OFFICIAL.sub("", row.description or "").strip()
        if summary and summary in text:
            summary = ""
        if apply:
            row.description = with_source(text, row.url, today)
        report.append(
            {
                **entry,
                "status": "updated" if apply else "would update",
                "replaced_summary": summary[:120],
            }
        )
    if apply:
        session.commit()
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="fetch and report; no DB writes")
    mode.add_argument("--apply", action="store_true", help="write the fetched text")
    parser.add_argument(
        "--allow-hosted",
        action="store_true",
        help="also acknowledge non-local persistence with --apply",
    )
    args = parser.parse_args(argv)
    with ingestion_session(
        explicit_database_url(), dry_run=args.dry_run, allow_hosted=args.allow_hosted
    ) as session:
        report = refresh(session, PublicJSONClient(), apply=args.apply, today=date.today())
    for item in report:
        detail = item.get("reason") or f"{item['method']}, {item['words']} words"
        print(f"{item['status']:>13}  {item['organization']} — {item['title']} ({detail})")
    print(f"{sum(i['status'] != 'skipped' for i in report)} of {len(report)} with full text")
    return 0


if __name__ == "__main__":
    sys.exit(main())
