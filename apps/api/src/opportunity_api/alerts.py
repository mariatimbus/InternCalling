"""Daily job alerts: new internships for each saved search with alerts on.

    python -m opportunity_api.alerts            # dry run: counts only, sends nothing
    python -m opportunity_api.alerts --send     # emails students, then moves each window

Each search covers postings first stored since its last alert, filtered like Jobs and
ranked by matching v2; confirmed mismatches are left out. One email per search with
new matches, at most ``MAX_ITEMS`` of them. Logs never contain emails or titles.
"""

import argparse
import smtplib
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from html import escape
from urllib.parse import urlencode

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .api.opportunities import _apply_filters, _to_matching_opportunity, _to_matching_profile
from .core.config import Settings, get_settings
from .core.database import get_db
from .matching import score_match
from .models import Opportunity, OpportunityDegreeLevel, OpportunityType, SavedSearch, User

MAX_ITEMS = 10
# Brand palette (AGENTS.md): electric blue, violet, navy, warm white.
BLUE, VIOLET, NAVY, WARM = "#2862CF", "#4A3F74", "#29263B", "#FFFBF0"


@dataclass(frozen=True)
class Item:
    id: str
    title: str
    organization: str
    location: str
    score: int
    reason: str


def matches(db: Session, search: SavedSearch, user: User, since: datetime) -> list[Item]:
    stmt = _apply_filters(
        select(Opportunity),
        opportunity_type=OpportunityType.internship,
        degree_level=OpportunityDegreeLevel(search.degree_level) if search.degree_level else None,
        location=search.location,
        is_active=True,
        deadline_after=None,
        deadline_before=None,
        search=search.search,
    ).where(
        Opportunity.created_at > since,
        or_(Opportunity.deadline.is_(None), Opportunity.deadline >= datetime.now(UTC)),
    )
    profile = _to_matching_profile(user, db)
    found = []
    for opportunity in db.scalars(stmt.options(selectinload(Opportunity.skills))):
        if search.study_year and (
            not opportunity.study_year or search.study_year not in opportunity.study_year
        ):
            continue
        match = score_match(profile, _to_matching_opportunity(opportunity))
        if match.eligibility == "not_eligible":
            continue
        reason = next((r for r in match.reasons if r.startswith("Matches ")), "")
        found.append(
            Item(
                str(opportunity.id),
                opportunity.title,
                opportunity.organization or "",
                opportunity.location or "",
                match.score,
                reason,
            )
        )
    found.sort(key=lambda item: (-item.score, item.id))
    return found[:MAX_ITEMS]


def message(settings: Settings, to: str, search: SavedSearch, items: list[Item]) -> EmailMessage:
    site = settings.site_url.rstrip("/")
    query = {"q": search.search or "", "location": search.location or ""}
    jobs = f"{site}/jobs?{urlencode({k: v for k, v in query.items() if v})}"
    noun = "internship" if len(items) == 1 else "internships"
    email = EmailMessage()
    email["Subject"] = f"{len(items)} new {noun} for “{search.name}”"
    email["From"] = settings.alerts_from or settings.smtp_user
    email["To"] = to
    lines = [f"New {noun} matching your saved search “{search.name}”:", ""]
    for item in items:
        where = " · ".join(filter(None, [item.organization, item.location]))
        lines += [
            f"{item.title} — {where} ({item.score}/100)",
            f"{site}/opportunities/{item.id}",
            "",
        ]
    lines += [f"See all: {jobs}", "Turn alerts off any time on Jobs → Saved searches."]
    email.set_content("\n".join(lines))

    def entry(i: Item) -> str:
        where = escape(" · ".join(filter(None, [i.organization, i.location])))
        link = f"{escape(site)}/opportunities/{escape(i.id)}"
        why = f'<br><span style="color:{NAVY}">✓ {escape(i.reason)}</span>' if i.reason else ""
        return (
            f'<li style="margin:0 0 14px"><a href="{link}" style="color:{BLUE};font-weight:600">'
            f"{escape(i.title)}</a><br>"
            f'<span style="color:{VIOLET}">{where} · {i.score}/100</span>{why}</li>'
        )

    body = "".join(map(entry, items))
    email.add_alternative(
        f'<div style="font-family:system-ui,sans-serif;color:{NAVY};background:{WARM};'
        f'padding:20px"><p>New {noun} matching <b>{escape(search.name)}</b>:</p>'
        f'<ul style="padding-left:18px">{body}</ul>'
        f'<p><a href="{escape(jobs)}" style="color:{BLUE}">See all on InternCalling</a></p>'
        f'<p style="color:{VIOLET};font-size:12px">'
        f"Turn alerts off any time on Jobs → Saved searches.</p></div>",
        subtype="html",
    )
    return email


def run(db: Session, settings: Settings, *, send: bool, smtp=None) -> dict[str, int]:
    stats = {"searches": 0, "emails": 0, "items": 0, "skipped_inactive": 0}
    now = datetime.now(UTC)
    rows = db.execute(
        select(SavedSearch, User)
        .join(User, User.id == SavedSearch.user_id)
        .where(SavedSearch.alert)
    ).all()
    for search, user in rows:
        stats["searches"] += 1
        if not user.is_active or not user.email:
            stats["skipped_inactive"] += 1
            continue
        since = search.last_alerted_at or search.created_at
        items = matches(db, search, user, since)
        if items:
            stats["items"] += len(items)
            if send:
                smtp.send_message(message(settings, user.email, search, items))
                stats["emails"] += 1
        if send:
            search.last_alerted_at = now  # the next email only covers what came after
            db.commit()
    return stats


def main(argv: list[str] | None = None) -> int:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--send", action="store_true", help="email students (default: dry run)")
    send = args.parse_args(argv).send
    settings = get_settings()
    if send and not (settings.smtp_host and (settings.alerts_from or settings.smtp_user)):
        print("SMTP is not configured; nothing sent.", file=sys.stderr)
        return 2
    sessions = get_db()
    db = next(sessions)
    try:
        if not send:
            print(run(db, settings, send=False))
            return 0
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            print(run(db, settings, send=True, smtp=smtp))
        return 0
    finally:
        sessions.close()


if __name__ == "__main__":
    raise SystemExit(main())
