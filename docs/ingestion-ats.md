# Public ATS connectors (C4)

Greenhouse, Lever and SmartRecruiters implement the existing `SourceAdapter`
contract in `apps/api/src/opportunity_api/ingestion/sources/ats.py`. Each adapter
represents one company, named `provider.identifier` (lowercase). Records use the
same source key, original posting ID, official application URL and UTC fetch time.
No deadline, degree or study-year values are inferred from prose; publication dates
are not application deadlines. Adapters never access persistence.

All roles, including senior/non-STEM/non-European roles, enter the existing C3
runner for normalization, scope, validation and deduplication. Ashby is deferred.

## Registry and orchestration

`employers.json` is a schema-validated allowlist of 24 relevant employers. Twenty
public endpoints returned valid job-board shapes during verification; four
unavailable candidates remain disabled. Dated results are recorded in
`apps/api/tests/fixtures/ats/registry_verification.json`. Verification does not
guarantee current vacancies or future access.

```python
from opportunity_api.ingestion.sources.employers import employer_registry

registry = employer_registry()  # local config only; no network access
adapters = registry.resolve()  # enabled companies only
# Or: registry.resolve(["greenhouse.databricks", "lever.palantir"])
report = runner.run(adapters)  # existing IngestionRunner; use dry_run=True first
```

C5's shared `registry.build_registry()` wraps this factory with explicit provider switches.
Use the [ingestion CLI guide](../services/ingestion/README.md#c5-command-line-ingestion)
for full ingestion/dry-run commands and server-only database configuration. The CLI supplies
the A15 runner and store. C3 stage order and the offline smoke command are preserved;
no scheduler or schema is introduced.

When updating employers, verify the public careers identifier and current
provider/employer terms before collection. Config accepts only provider identifiers
and Lever global/EU region, not arbitrary API endpoints, headers or credentials.
Careers URLs are provenance, never request targets. Use only public posting GET
interfaces; no submissions, internal postings, authentication, HTML scraping or
browser automation.

## Fetch behavior and failures

- Greenhouse requests the full board with `content=true`.
- Lever requests JSON pages with `skip`/`limit`, including its EU API when configured.
- SmartRecruiters pages with `offset`/`limit` and retrieves details for descriptions
  and `applyUrl`. Detail URLs are constructed locally, never taken from `ref`.
  Known country codes are expanded for C3; unknown codes remain unchanged for review.
- One shared synchronous client enforces at least one second between requests per
  host, including retries. Robots crawl delays/request rates increase that interval.
- Requests have a 15-second timeout and retry temporary transport/429/5xx errors
  twice with backoff. Numeric Retry-After up to 60 seconds is respected; longer or
  date-form values defer the company by failing this run.
- Robots are cached per client/run. A 404 means no rules; denial or other failures
  fail closed. Redirects are refused. Bodies are capped at 10 MB and paginated
  providers at 100 pages; reaching a cap is reported as failure.
- Valid siblings survive malformed postings, followed by a source failure. A
  listing/detail fetch failure terminates that company. The runner records
  `failed_sources` and continues other companies/providers. Previously yielded
  records can still be processed. Reports omit raw exception/payload details.

Keep source keys stable: changing them affects provenance/deduplication. Failures
use the runner's existing generic `fetch_failed` diagnostic and the company key.

## Offline validation

Run from `apps/api`:

```bash
uv run pytest tests/test_ats_sources.py tests/test_ingestion_normalization.py tests/test_ingestion_runner.py --no-cov
uv run pytest
uv run ruff check .
uv run python -m opportunity_api.ingestion.smoke
```

`tests/fixtures/ats/` holds saved real public responses with parser-relevant fields
retained; public contact emails are redacted. `provenance.json` records request
URLs, capture timestamps and sanitization. `expected.json` pins identities, titles,
application URLs and locations. Empty/malformed fixtures and pagination envelopes
are synthetic; SmartRecruiters details are real responses. Review refreshed
fixtures for secrets and personal contact data before committing.

Tests perform no network I/O. They cover success/empty/malformed per adapter,
C3 fixture dry runs without writes, timeout/HTTP/JSON failure isolation, malformed
siblings, pagination, EU Lever, robots, response limits, backoff, scope rejection
and idempotent reruns against disposable SQLite. The existing persistence layer
is unchanged; no shared database was used for C4.

Provider references:
[Greenhouse Job Board API](https://docs.greenhouse.io/job-board),
[Lever public Postings API](https://github.com/lever/postings-api),
[SmartRecruiters public endpoints](https://developers.smartrecruiters.com/docs/endpoints).

## Full text for curated postings

Curated shortlist rows (`source = maria_europe_master_2026_10_12`) were imported with a short
summary and the official link. Matching, eligibility (graduation years, final year) and the ATS
check read the posting text, so `opportunity_api.ingestion.full_text` replaces each summary with
the official posting's full text:

1. the ATS's public API (Greenhouse, Lever, Ashby, Workday);
2. a schema.org `JobPosting` embedded in the page (Stripe, Optiver, SIG, BlackRock);
3. headed description sections (amazon.jobs) or the page's `<main>`.

Requests go through `PublicJSONClient` (robots.txt, per-host interval, no redirects, size cap).
Text under 120 words is not trusted and the row keeps its summary. The official link stays as
the last lines with a fresh "Source last checked" date, and re-running is idempotent.

```bash
cd apps/api
uv run python -m opportunity_api.ingestion.full_text --dry-run            # report only
uv run python -m opportunity_api.ingestion.full_text --apply --allow-hosted
```

Sites that refuse automated reads (403) or closed postings (404) are reported as skipped.
