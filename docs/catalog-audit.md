# Read-only catalog release audit (A13)

Task: https://app.notion.com/p/3f688c98b3c08192b750ea79fcb6a887
Branch: `fix/maria-release-hardening`; owner: Maria. Final acceptance still depends
on A10/C3–C8 integration, hosted verification, GitHub checks and human review.

Export the **complete public opportunity catalog**, without user/profile/application
or CV data, to a local JSON list. A complete `{ "items": [...], "total": N }`
envelope is also supported; a partial API page is rejected. API responses do not
yet include `last_seen_at`; include that field from an approved read-only export
if freshness is being audited. Missing timestamps remain unknown.

```sh
uv run --project apps/api python scripts/catalog_audit.py /tmp/catalog.json \
  --report /tmp/catalog-audit.json --as-of 2026-11-17T00:00:00Z
# Explicit opt-in to a bounded, rate-limited public network audit:
uv run --project apps/api python scripts/catalog_audit.py /tmp/catalog.json \
  --report /tmp/catalog-links.json --check-links --max-links 20 --strict
```

The command never connects to a database, uses an account token, edits a row,
deletes a posting or changes publication status. Reports contain row positions
and controlled finding codes, not descriptions, URLs or personal data. Input is
bounded to 30 MB/100,000 records; report paths cannot overwrite input exports.

Thresholds and interpretation:

- Any active expired row, duplicate canonical URL/provider identity, missing/invalid
  official URL, malformed eligibility field or zero active catalog is an error.
- More than 30 days since last seen is a review finding (override with
  `--stale-days`). Unknown dates/eligibility/source provenance remain review
  findings; no missing employer requirement is inferred from title or location.
- Link checks use only enabled registry employer paths on fixed Greenhouse, Lever
  and SmartRecruiters hosts, credential-free HTTPS, no redirects/cookies/auth,
  bounded robots reads and HEAD requests. Unrecognized query parameters/fragments
  require review and are never sent to a posting endpoint. Robots denial/failed robots fetches,
  redirects, HEAD rejection, throttling and network failures require review.
- Only HTTP 404/410 is classified as broken; a 2xx HEAD proves reachability only,
  not that applications remain open. Other official domains need manual review;
  they are never fetched from arbitrary input. At most 20 unique links are checked
  by default, maximum 100, with results cached within one run.
- Exit 0 means no structural errors; it **does not certify full link coverage**.
  Exit 1 means errors, or under `--strict`, any review finding/unverified links.
  Exit 2 means invalid/incomplete input or an audit that could not execute.

Use strict mode and inspect remaining coverage before a release. Combine separate
export batches only before auditing, so cross-page duplicates remain detectable.
Real employer classification, Europe/tech relevance, legal eligibility meaning,
source terms and a representative manual sample still require Dalia/Maria review.
No live catalog quality is claimed from synthetic tests. Tests cover unsafe URLs,
robots denial, bounded links, partial exports, preservation of input, failures and
100 generated canonicalization/idempotence/inactive-row invariants per run.

Local validation: 32 focused audit tests passed. The full A13 branch backend suite
passed 455 tests with 95.83% coverage; Ruff and diff checks passed. No live catalog
export or hosted audit was available. No new package dependencies or API/schema
changes are introduced by the audit.
