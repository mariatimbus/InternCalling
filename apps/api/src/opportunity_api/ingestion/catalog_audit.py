"""Read-only catalog release audit; findings never unpublish or delete records."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request
from urllib.robotparser import RobotFileParser

from .normalize import canonical_url
from .sources.employers import load_employers
from .sources.http import USER_AGENT, PublicJSONClient

MAX_RECORDS = 100_000
MAX_INPUT_BYTES = 30_000_000
ATS_HOSTS = {
    "greenhouse": {"boards.greenhouse.io", "job-boards.greenhouse.io"},
    "lever": {"jobs.lever.co", "jobs.eu.lever.co"},
    "smartrecruiters": {"jobs.smartrecruiters.com"},
}


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("expected ISO timestamp")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(UTC)


def official_ats_url(url, source, employers):
    """Only configured employer paths on fixed ATS hosts are eligible for probing."""
    if not isinstance(url, str) or not isinstance(source, str) or source not in employers:
        return None
    try:
        clean = canonical_url(url)
        parts = urlsplit(clean)
        provider, identifier = employers[source]
        if (
            parts.scheme != "https"
            or parts.hostname not in ATS_HOSTS[provider]
            or parts.port not in {None, 443}
            or parts.query
            or parts.fragment
            or not parts.path.startswith(f"/{identifier}/")
        ):
            return None
        return clean
    except (ValueError, KeyError, TypeError):
        return None


class LinkChecker:
    """Bounded HEAD checks. No redirects, credentials, cookies or arbitrary hosts.

    Robots rules fail closed; rate limits/crawl delays are honored. HEAD rejection,
    redirects, network failures and robots denial are review findings, not proof
    that a posting is broken. No fallback downloads of job pages are attempted.
    """

    def __init__(self, client=None):
        self.client = client or PublicJSONClient()
        self.rules = {}

    def __call__(self, url):
        try:
            clean = canonical_url(url)
            parts = urlsplit(clean)
            if (
                parts.scheme != "https"
                or parts.port not in {None, 443}
                or parts.hostname not in set().union(*ATS_HOSTS.values())
                or parts.query
                or parts.fragment
            ):
                return "unverified"
        except (ValueError, TypeError, AttributeError):
            return "unverified"
        client = self.client
        origin = f"https://{parts.netloc}"
        try:
            if origin not in self.rules:
                rules = RobotFileParser()
                try:
                    text = client._read(origin + "/robots.txt", client.interval).decode("utf-8")
                except HTTPError as exc:
                    if exc.code != 404:
                        return "unverified"
                    text = "User-agent: *\nDisallow:"
                rules.parse(text.splitlines())
                self.rules[origin] = rules
            rules = self.rules[origin]
            if not rules.can_fetch(USER_AGENT, url):
                return "robots_denied"
            interval = max(client.interval, rules.crawl_delay(USER_AGENT) or 0)
            rate = rules.request_rate(USER_AGENT)
            if rate:
                interval = max(interval, rate.seconds / rate.requests)
            delay = interval - (client.clock() - client._last.get(parts.netloc, float("-inf")))
            if delay > 0:
                client.sleep(delay)
            client._last[parts.netloc] = client.clock()
            request = Request(clean, method="HEAD", headers={"User-Agent": USER_AGENT})
            with client.open_url(request, timeout=client.timeout) as response:
                status = response.status
            return "reachable" if 200 <= status < 300 else "unverified"
        except HTTPError as exc:
            return "broken" if exc.code in {404, 410} else "unverified"
        except (URLError, TimeoutError, OSError, UnicodeError, ValueError):
            return "unverified"


def audit_catalog(records, *, now, employers, stale_days=30, check_link=None, max_links=20):
    if not isinstance(records, list) or len(records) > MAX_RECORDS:
        raise ValueError("expected a bounded complete list of public opportunity records")
    if now.tzinfo is None or not 1 <= stale_days <= 3650 or not 0 <= max_links <= 100:
        raise ValueError("invalid audit bounds")
    now = now.astimezone(UTC)
    issues, urls, providers = [], defaultdict(list), defaultdict(list)
    active, probed, links = 0, 0, {}

    def finding(row, code, severity="error"):
        # Row positions only: never echo descriptions, tokens or user-controlled URLs.
        issues.append({"row": row, "code": code, "severity": severity})

    for index, row in enumerate(records):
        if not isinstance(row, dict) or type(row.get("is_active")) is not bool:
            finding(index, "invalid_record")
            continue
        if not row["is_active"]:
            continue
        active += 1
        source, source_id = row.get("source"), row.get("source_id")
        if isinstance(source, str) and isinstance(source_id, str) and source_id.strip():
            providers[(source, source_id)].append(index)
        else:
            finding(index, "missing_source_identity")
        url = official_ats_url(row.get("url"), source, employers)
        try:
            urls[canonical_url(row.get("url", ""))].append(index)
        except (ValueError, TypeError, AttributeError):
            finding(index, "invalid_official_url")
        if not isinstance(source, str) or source not in employers:
            finding(index, "unverified_source", "review")
        if url is None:
            finding(index, "official_source_requires_review", "review")
        for field in ("deadline", "last_seen_at"):
            value = row.get(field)
            if value is None:
                if field == "last_seen_at":
                    finding(index, "freshness_unknown", "review")
                continue
            try:
                parsed = timestamp(value)
                if field == "deadline" and parsed <= now:
                    finding(index, "active_expired")
                elif field == "last_seen_at" and parsed < now - timedelta(days=stale_days):
                    finding(index, "stale_requires_review", "review")
                elif field == "last_seen_at" and parsed > now + timedelta(minutes=5):
                    finding(index, "future_last_seen", "review")
            except ValueError:
                finding(index, f"invalid_{field}")
        degree, years = row.get("degree_level"), row.get("study_year")
        if degree is not None and degree not in ("bachelor", "master", "both"):
            finding(index, "invalid_degree")
        if years is not None and (
            not isinstance(years, list)
            or not years
            or any(type(year) is not int or year not in range(1, 7) for year in years)
            or len(years) != len(set(years))
        ):
            finding(index, "invalid_study_year")
        if degree is None or years is None:
            finding(index, "eligibility_unknown", "review")
        if url and check_link:
            if url not in links and probed < max_links:
                links[url] = check_link(url)
                probed += 1
            result = links.get(url, "not_checked")
            if result != "reachable":
                finding(index, "link_" + result, "error" if result == "broken" else "review")
    for identities, code in ((urls, "duplicate_url"), (providers, "duplicate_source_identity")):
        for rows in identities.values():
            if len(rows) > 1:
                for index in rows:
                    finding(index, code)
    if active == 0:
        finding(None, "empty_active_catalog")
    issues.sort(key=lambda issue: (issue["row"] if issue["row"] is not None else -1, issue["code"]))
    return {
        "scope": "read-only catalog audit; no database or publication changes",
        "as_of": now.isoformat(),
        "records": len(records),
        "active": active,
        "errors": sum(issue["severity"] == "error" for issue in issues),
        "review_findings": sum(issue["severity"] == "review" for issue in issues),
        "links_checked": probed,
        "links_unverified": not check_link
        or any(i["code"].startswith("link_") for i in issues)
        or any(i["code"] == "official_source_requires_review" for i in issues),
        "findings": issues,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input", type=Path, help="Complete public catalog JSON export (not user data)"
    )
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--as-of", help="Timezone-aware ISO timestamp for reproducible audits")
    parser.add_argument("--stale-days", type=int, default=30)
    parser.add_argument(
        "--check-links", action="store_true", help="Opt in to public ATS HEAD checks"
    )
    parser.add_argument("--max-links", type=int, default=20)
    parser.add_argument(
        "--strict", action="store_true", help="Also fail on unknown/review findings"
    )
    args = parser.parse_args(argv)
    try:
        if args.input.resolve() == args.report.resolve():
            raise ValueError("report must not overwrite the input export")
        with args.input.open("rb") as stream:
            data = stream.read(MAX_INPUT_BYTES + 1)
        if len(data) > MAX_INPUT_BYTES:
            raise ValueError("catalog export exceeds size limit")
        records = json.loads(data)
        if isinstance(records, dict):
            if type(records.get("total")) is not int or not isinstance(records.get("items"), list):
                raise ValueError("expected complete items/total export")
            if records["total"] != len(records["items"]):
                raise ValueError("partial page cannot certify a complete catalog")
            records = records["items"]
        employers = {
            item.source_name: (item.provider, item.identifier)
            for item in load_employers()
            if item.enabled
        }
        result = audit_catalog(
            records,
            now=timestamp(args.as_of) if args.as_of else datetime.now(UTC),
            employers=employers,
            stale_days=args.stale_days,
            check_link=LinkChecker() if args.check_links else None,
            max_links=args.max_links,
        )
        args.report.write_text(json.dumps(result, indent=2) + "\n")
    except (ValueError, OSError, TypeError):
        parser.exit(2, "Audit could not run: verify the complete export, bounds and file paths.\n")
    print(
        f"Audited {result['active']} active rows: {result['errors']} errors, "
        f"{result['review_findings']} review findings; {result['links_checked']} links checked. "
        f"Link coverage: {'incomplete' if result['links_unverified'] else 'complete'}."
    )
    return int(
        bool(
            result["errors"]
            or args.strict
            and (result["review_findings"] or result["links_unverified"])
        )
    )
