"""Synthetic exports, deterministic invariants and bounded transport failures."""

import io
import json
import random
from copy import deepcopy
from datetime import UTC, datetime
from urllib.error import HTTPError

import pytest

from opportunity_api.ingestion.catalog_audit import LinkChecker, audit_catalog, main
from opportunity_api.ingestion.normalize import canonical_url
from opportunity_api.ingestion.sources.http import PublicJSONClient

NOW = datetime(2026, 11, 17, tzinfo=UTC)
EMPLOYERS = {"greenhouse.synthetic": ("greenhouse", "synthetic")}


def row(**changes):
    return {
        "is_active": True,
        "source": "greenhouse.synthetic",
        "source_id": "1",
        "url": "https://job-boards.greenhouse.io/synthetic/jobs/1",
        "last_seen_at": "2026-11-16T00:00:00Z",
        "deadline": "2026-12-01T00:00:00Z",
        "degree_level": "both",
        "study_year": [1, 2],
        **changes,
    }


def audit(rows, **options):
    return audit_catalog(rows, now=NOW, employers=EMPLOYERS, **options)


def codes(report):
    return {item["code"] for item in report["findings"]}


def test_clean_offline_audit_does_not_claim_links_verified_or_modify_records():
    rows = [row()]
    original = deepcopy(rows)
    report = audit(rows)
    assert report["errors"] == report["review_findings"] == 0
    assert report["links_checked"] == 0 and report["links_unverified"]
    assert rows == original


def test_expired_stale_duplicate_and_invalid_eligibility_are_separate_findings():
    report = audit(
        [
            row(deadline="2026-01-01T00:00:00Z", last_seen_at="2026-01-01T00:00:00Z"),
            row(
                url=row()["url"] + "?utm_source=synthetic",
                degree_level="doctorate",
                study_year=[True],
            ),
            row(is_active=False),
        ]
    )
    assert codes(report) >= {
        "active_expired",
        "stale_requires_review",
        "duplicate_url",
        "duplicate_source_identity",
        "invalid_degree",
        "invalid_study_year",
    }
    assert report["active"] == 2


@pytest.mark.parametrize("value", [[], [0], [7], [True], [1, 1], [[1]], "1", {}])
def test_invalid_years_do_not_crash_or_become_unknown(value):
    assert "invalid_study_year" in codes(audit([row(study_year=value)]))


def test_unknown_fields_are_review_not_invented_ineligibility():
    report = audit([row(degree_level=None, study_year=None, last_seen_at=None)])
    assert report["errors"] == 0
    assert codes(report) == {"freshness_unknown", "eligibility_unknown"}


@pytest.mark.parametrize("value", ["bad", "2026-11-16T00:00:00", 1])
def test_bad_dates_are_explicit_errors(value):
    assert "invalid_deadline" in codes(audit([row(deadline=value)]))


def test_invalid_urls_and_unknown_sources_never_reach_transport_or_echo_input():
    calls = []
    rows = [
        row(url="https://localhost/private?api_key=synthetic-only", source=[]),
        row(url="https://job-boards.greenhouse.io/other/jobs/1"),
        row(url="https://job-boards.greenhouse.io.attacker.invalid/synthetic/jobs/1"),
    ]
    report = audit(rows, check_link=lambda url: calls.append(url))
    assert not calls
    assert "synthetic-only" not in json.dumps(report)
    assert report["links_unverified"]


def test_link_budget_cache_and_conservative_http_classification():
    calls = []

    def check(url):
        calls.append(url)
        return "broken"

    report = audit(
        [row(), row(), row(source_id="2", url=row()["url"] + "2")], check_link=check, max_links=1
    )
    assert len(calls) == report["links_checked"] == 1
    assert codes(report) >= {"link_broken", "link_not_checked"}


def test_complete_export_required_and_strict_offline_is_partial(tmp_path):
    source, report = tmp_path / "catalog.json", tmp_path / "audit.json"
    source.write_text(json.dumps({"items": [row()], "total": 2}))
    with pytest.raises(SystemExit, match="2"):
        main([str(source), "--report", str(report)])
    assert not report.exists()
    # Known configured source; no network required, live link coverage remains unknown.
    source.write_text(
        json.dumps(
            [
                row(
                    source="greenhouse.databricks",
                    url="https://job-boards.greenhouse.io/databricks/jobs/1",
                )
            ]
        )
    )
    assert main([str(source), "--report", str(report), "--as-of", NOW.isoformat()]) == 0
    assert main([str(source), "--report", str(report), "--as-of", NOW.isoformat(), "--strict"]) == 1


def test_empty_catalog_is_release_error():
    assert codes(audit([])) == {"empty_active_catalog"}


def test_generated_canonicalization_and_audit_invariants():
    rng = random.Random(1729)
    for _ in range(100):
        identifier = str(rng.randrange(1, 1_000_000))
        base = f"https://job-boards.greenhouse.io/synthetic/jobs/{identifier}"
        tracked = base + "?utm_source=synthetic&lang=en"
        assert canonical_url(canonical_url(tracked)) == canonical_url(tracked)
        records = [row(url=base, source_id=identifier)]
        assert audit(records) == audit(deepcopy(records))
        with_inactive = audit(records + [row(is_active=False)])
        assert with_inactive["findings"] == audit(records)["findings"]
        assert with_inactive["active"] == 1
        assert "duplicate_url" in codes(audit(records * 2))


class Response(io.BytesIO):
    status = 200


@pytest.mark.parametrize(
    "status,expected",
    [
        (200, "reachable"),
        (404, "broken"),
        (410, "broken"),
        (301, "unverified"),
        (403, "unverified"),
        (405, "unverified"),
        (429, "unverified"),
        (503, "unverified"),
    ],
)
def test_robots_aware_head_never_downloads_or_follows_posting(status, expected):
    calls, waits = [], []

    def open_url(request, timeout):
        calls.append((request.full_url, request.get_method()))
        if request.full_url.endswith("robots.txt"):
            return Response(b"User-agent: *\nCrawl-delay: 2\nAllow: /\n")
        if status != 200:
            raise HTTPError(request.full_url, status, "synthetic", {}, None)
        return Response(b"")

    client = PublicJSONClient(open_url=open_url, sleep=waits.append, clock=lambda: 0)
    assert LinkChecker(client)(row()["url"]) == expected
    assert [method for _, method in calls] == ["GET", "HEAD"]
    assert waits == [2]


def test_robots_denial_and_non_ats_hosts_cannot_be_probed():
    calls = []

    def open_url(request, timeout):
        calls.append(request.full_url)
        return Response(b"User-agent: *\nDisallow: /\n")

    checker = LinkChecker(PublicJSONClient(open_url=open_url))
    assert checker("https://127.0.0.1/") == "unverified"
    assert not calls
    assert checker(row()["url"]) == "robots_denied"
    assert len(calls) == 1 and calls[0].endswith("robots.txt")


def test_report_cannot_overwrite_source_export(tmp_path):
    source = tmp_path / "catalog.json"
    original = json.dumps([row()])
    source.write_text(original)
    with pytest.raises(SystemExit, match="2"):
        main([str(source), "--report", str(source)])
    assert source.read_text() == original


def test_future_seen_and_invalid_record_cannot_be_clean():
    report = audit([row(last_seen_at="2027-01-01T00:00:00Z"), {"is_active": "true"}])
    assert codes(report) == {"future_last_seen", "invalid_record"}


def test_robots_network_failure_remains_unverified_without_head():
    calls = []

    def open_url(request, timeout):
        calls.append(request.get_method())
        raise TimeoutError

    client = PublicJSONClient(open_url=open_url, sleep=lambda _: None)
    assert LinkChecker(client)(row()["url"]) == "unverified"
    assert calls == ["GET"] * 3  # Existing bounded robots retry policy, never HEAD.


def test_unrecognized_query_credentials_do_not_get_probed():
    calls = []
    report = audit(
        [row(url=row()["url"] + "?token=synthetic-only")], check_link=lambda url: calls.append(url)
    )
    assert not calls and report["links_unverified"]
    assert "synthetic-only" not in json.dumps(report)
