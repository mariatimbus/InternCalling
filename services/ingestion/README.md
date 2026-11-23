# Opportunity ingestion

The C2 manual importer is `opportunity_api.ingestion.seed` in the existing backend
Python package, reusing its reviewed enums and database dependencies. From the root:

```powershell
uv run --project apps/api python -m opportunity_api.ingestion.seed
```

Default behavior is offline validation only. See
[the audited seed guide](../../database/seeds/README.md) for generation, deterministic
IDs, atomic upserts, rejection reports and the explicit `--apply` approval gate.
Do not run hosted imports or publish candidates without Dalia's approval.

## C5 command-line ingestion

Run from the **outer repository root**, not a nested checkout. Install the backend's
locked dependencies with `uv sync --project apps/api --python 3.13 --frozen`.

All enabled ATS companies, through the shared C3/A15 runner:

```sh
uv run --project apps/api python -m opportunity_api.ingestion.cli --apply --report /tmp/ingestion-apply-001.json
```

The same configured sources and transformations, with zero database writes:

```sh
uv run --project apps/api python -m opportunity_api.ingestion.cli --dry-run --report /tmp/ingestion-preview-001.json
```

Both commands fetch **live public job boards**. Dry-run prevents database writes, not HTTP
requests. Automated tests substitute the saved C4 responses and never contact live boards.
For a fully offline fixture smoke check, use the existing smoke command below.

### Configuration and credentials

- `DATABASE_URL` must be explicitly set in the process environment or the root `.env`.
  The existing `APP_DATABASE_URL` alias is also accepted. No ingestion command falls back
  to the backend's default SQLite file. Run from the root so settings load that `.env`.
- Use the existing `postgresql+psycopg://` server-side connection to an already migrated
  database. Supabase direct/session-pooler connections use TLS (`sslmode=require` or
  certificate verification). No Supabase service-role API key, Auth JWT or Supabase SDK
  is required by C5. Database passwords remain server/CI secrets.
- For development and tests use an existing disposable local SQLite catalogue or local
  PostgreSQL. The CLI never creates schema. SQLite requires a real existing file; CLI
  in-memory URLs and custom URI parameters are refused. Test setup creates its own schema.
- Non-local PostgreSQL persistence additionally requires `--allow-hosted` alongside
  `--apply`. This acknowledges the target; it does not replace the team's approval of
  hosted imports. No hosted ingestion was performed during C5 development or tests.
- Database URLs are not CLI arguments, source configuration or report fields. Never put
  privileged values in `apps/web`, `NEXT_PUBLIC_*`, committed config, fixtures or logs.

Provider switches live in
`apps/api/src/opportunity_api/ingestion/sources/providers.json`:

```json
{"greenhouse": true, "lever": true, "smartrecruiters": false, "ashby": true, "arbeitnow": true}
```

Every supported provider must have a JSON boolean; unknown keys and coerced strings
are rejected (`ashby`/`arbeitnow` default to off when absent). SmartRecruiters is off:
its `robots.txt` now disallows every crawler except LinkedIn's. Ashby uses the public
posting API; Arbeitnow is a free multi-company board (newest 10 pages per run, with
postings linking back to Arbeitnow). Company switches remain in the adjacent `employers.json` registry.
A company runs only when **both** its provider and company entry are enabled. Preserve
existing source keys (`provider.identifier`) and provider IDs across configuration edits.
The registry currently enables 20 companies; endpoint availability can change.

Override either file with `--providers /path/to/providers.json` and/or
`--employers /path/to/employers.json`. Overrides follow the same schema and contain no
headers, API credentials or arbitrary API endpoint URLs. A configuration enabling no
sources fails before opening the database. Registry construction itself performs no I/O
beyond reading these local configuration files.

### Architecture, identity and dry-run guarantees

```text
provider AND employer switches -> shared registry -> C4 adapters -> RawOpportunity
  -> C3 normalize/clean -> scope -> validate -> final scope -> dedupe
  -> A15 OpportunityStore (apply) OR read-only preview (dry-run) -> JSON report
```

C3 stage order and review safeguards are preserved. All roles enter C3, including
out-of-scope roles. No adapter receives a database session or writes opportunities.
The seed importer remains a separate reviewed workflow; C5 introduces no second persistence
implementation, migrations, ingestion HTTP endpoint or scheduler.

A15 updates matched opportunities in place. It retains canonical UUIDs and application
foreign keys rather than deleting/reinserting rows. Existing identity priority remains
provider/source ID, canonical URL, then conservative fingerprint. UUID stability means
stable across imports into the same catalogue, not identical UUIDs across rebuilt databases.
An unchanged matched replay counts as `updated` for A15 compatibility. Changed/reviewed
postings remain subject to C3's publication rules; ingestion never auto-publishes.

Dry-run uses the same transformations and `Deduplicator` identity matcher. A detached,
run-local snapshot carries preceding predicted URL/provider-ID changes across source
boundaries. If posting A moves from URL X to Y and posting B reuses X, preview reports
one would-update and one would-create, matching sequential apply. The snapshot reloads
for each run, preserves existing canonical UUIDs, and gives new predictions no invented
UUID. It never mutates SQLAlchemy ORM objects. `preview()` distinguishes would-create,
would-update and cross-source/weak duplicates without upsert, publication holds, flush,
commit or schema creation.
SQLite opens with `mode=ro` plus `query_only`; PostgreSQL starts each transaction with
`SET TRANSACTION READ ONLY`. The configured existing catalogue is read to predict updates;
the exported JSON is a **local report file**, not a database write. A preview cannot
predict later concurrent changes, constraint failures or a future source response.

### Failure handling and reports

The CLI emits UTF-8 JSON to stdout and optionally to a new `--report` file. Existing report
paths are refused before fetching or writing the database. Parent directories must exist.
The requested report is written and flushed before stdout, so a closed stdout pipe cannot
prevent artifact export. Stdout failure returns code 1 without rerunning ingestion; a
broken OS pipe is handled without a second interpreter-shutdown flush error. If file export
fails, stdout is still attempted independently. Database commits and filesystem exports
are not one atomic transaction. A setup failure can leave a reserved empty report file;
use a new filename for the next attempt.

Reports contain run UUID, UTC start/end timestamps, mode, per-source status and counters:
`fetched`, `accepted`, `created`, `updated`, `duplicates`, `rejected`, `failed`,
`would_create`, `would_update`, `review_required`, and `source_failures`.

- `failed` counts record-processing failures; `source_failures` counts source fetch/commit
  failures. A timeout before any records means `fetched=0`, `failed=0`,
  `source_failures=1`, source status `failed`, and an entry in `failed_sources`.
- `accepted` retains C3's initial-scope admission meaning, including review records;
  it is not an additional terminal outcome to sum with created/failed/duplicates.
- Rejection, validation, duplicate, timeout/HTTP/JSON and commit issues contain controlled
  reasons and hashed record references. Raw exceptions, URLs and payloads are omitted.
- Known malformed records skipped inside a C4 parser currently produce a source failure;
  the runner cannot invent a precise record count for inputs the adapter did not emit.

Existing record savepoints and per-source commits isolate failures. A partial source can
retain previously yielded valid rows. Failed commits roll back that source, correct
success counts and allow later sources to complete. Review conflicts stay in the review
report rather than being merged unsafely. Retain this report for review evidence.

Exit codes: `0` for a completed run without record/source failures; `1` for execution,
record/source failure or export failure; `2` for argument/configuration errors or an
unavailable report destination. Rejections/review flags alone do not make the CLI fail.
A partial failure is reported after healthy sources have completed.

### C5 automated verification

From `apps/api` (all test databases are disposable and local):

```sh
uv run pytest tests/test_ingestion_integration.py tests/test_ingestion_cli.py tests/test_ingestion_preview.py --no-cov
uv run pytest
uv run ruff check .
uv run python -m opportunity_api.ingestion.smoke
```

Integration coverage includes all three actual ATS parsers from saved fixtures, repeated
runs and real updates, stable canonical UUIDs, application FK/status/notes preservation
with SQLite FK enforcement enabled, provider/company switches, full JSON reporting,
source-failure isolation and safe errors. Dry-run tests reject attempted SQL DML/DDL and
flush/commit/upsert calls, compare persisted IDs/values/timestamps, and verify that SQLite
itself refuses writes. Regression tests cover URL moves/reuse within a batch and across
sources, repeated previews, native-ID adoption, duplicate classification, preserved UUIDs
and application links. Stdout write/flush failures and a closed OS pipe must still retain
the requested JSON artifact, return 1 and ingest only once. Actual connection exceptions
are injected at a local engine connect event and checked for credential redaction.

A focused test exercises real SQLAlchemy begin events and proves that the PostgreSQL
`SET TRANSACTION READ ONLY` hook precedes queries in each transaction. It intercepts that
statement on an in-memory SQLite engine; it is not a PostgreSQL-server test. No local
PostgreSQL tools or Docker were available during verification, so PostgreSQL write rejection,
constraints and hosted RLS remain unverified. Database-routing/hosted-apply checks never
connect to PostgreSQL. No hosted test or additional database dependency was introduced.

## Pipeline (A14 / A15 / C3 / C4 / C5)

The automated ingestion path is distinct from the reviewed C2 seed importer:

```text
adapter -> RawOpportunity -> normalize/clean -> scope -> validate -> final scope -> dedupe -> persist -> report
```

C3 is entirely offline. It adds no database columns, migrations, public endpoints or dependencies.
`RawOpportunity`, `SourceAdapter`, `NormalizedOpportunity` (still importable from `persistence`)
and `IngestionRunner.run(adapters)` retain their existing interfaces. C4 provides public ATS
adapters; C5 assembles them using `registry.build_registry()` and a server-only CLI. The
legacy `registry.register()`/`resolve()` helpers still manage an explicitly populated registry;
the CLI uses a fresh configured registry, not import-time global registration.

### Deterministic normalization

`normalize.py` returns a field mapping consumed by `validate.py` and the existing normalized model.
Titles, organizations and locations collapse whitespace, including newlines and nonbreaking spaces.
Descriptions are converted from HTML to plain readable text with paragraph/list boundaries and
entities decoded; comments, script/style/noscript/template contents are omitted. This is text
extraction, not an HTML renderer or a browser sanitizer; CSS-hidden content is not evaluated.

URL canonicalization lowercases scheme/host, IDNA-encodes hostnames, removes default ports and
normalizes query encoding. It retains path case/trailing slashes, essential query keys, repeated
keys and their order, unknown keys, and fragments (which can identify SPA job postings). It never
forces HTTP to HTTPS, rewrites a provider path or assumes that www/non-www domains are aliases.
Only these case-insensitive tracking keys are removed:

```text
utm_source utm_medium utm_campaign utm_term utm_content utm_id
 gclid dclid fbclid msclkid mc_cid mc_eid igshid _ga _gl gh_src
```

Unknown `utm_*` keys and generic `source`, `ref`, `lang`, `id`, `jobId` parameters are preserved.
URLs require HTTP(S), a hostname, standard HTTP/HTTPS ports and no user/password, whitespace or
known credential query keys (`access_token`, `api_key`, `password`, `client_secret`). This validates
the supplied link shape; it does not certify domain ownership or follow redirects/network links.
Missing official URLs are held in the review report; C3 does not invent a public link or URN.

Dates accept ISO calendar dates, explicitly timezone-aware ISO datetimes, or an English named-month
calendar date (for example `3 February 2027`). Datetimes are converted to UTC. Date-only values
use midnight UTC as the existing storage convention, not an asserted official closing time.
Locale-ambiguous dates, invalid dates and naive timestamps become None plus a review diagnostic.
Missing dates remain None; neither absence nor future dates imply an open/public opportunity.
The ingestion fetch time is not a posting/publication date.

Degrees accept only the exact bachelor/master/both vocabulary and clear combinations/aliases
(BSc/MSc/undergraduate). Negations, preferences, equivalent-experience alternatives and unsupported
wording stay None with a review diagnostic. Study years accept standalone explicit years 1-6,
closed ascending ranges and lists; lists are sorted/unique. Boolean/coerced or out-of-range years
are rejected by validation. No recommendation group is used as eligibility. `2+`, completed years
by a future start, graduation windows, penultimate/final years and degree-duration alternatives
remain None with review required. The original source description is preserved as cleaned text;
review consumers should retrieve the original posting when separate raw eligibility fields need
inspection. No extra raw-payload or academic-rule database fields were introduced.

Review metadata is carried separately from database fields. `validate()` explicitly copies
`_review_notices` and `_requires_review` when rebuilding a `NormalizedOpportunity`; it never
expects `model_dump()` to include private attributes. The runner accumulates source/hook notices
independently and checks raw normalization notices even when a custom normalizer returns a new
model or drops metadata. Validator/dedupe hooks cannot clear this accumulated review requirement.

### Scope: accepted, rejected, review

Scope evaluates the normalized text, before persistence. Existing English/German/French role
patterns remain: intern/internship, working student, Werkstudent, Praktikant/Praktikum,
stage/stagiaire, placement and student worker/assistant/job. A generic student/trainee title needs
review; titles without a student-role signal are rejected. Tech/STEM uses the explicit bounded
vocabulary in `scope.py`, across title and cleaned description. Clear marketing/HR/sales/social
roles without STEM evidence are rejected; an unestablished domain is retained for review.
The word `it` is not in the case-insensitive STEM vocabulary. `It` in prose is a pronoun, not
evidence of a technical role. `IT` requires an explicit title context such as `IT Intern`,
`IT Support` or `IT Working Student`; the full phrase `information technology` is also recognized.
Bare `IT`/`it` in a description leaves the domain unresolved. This is a finite vocabulary, not
general natural-language understanding of every abbreviation or job description.

Scope is checked again against the validated title, description and location. A hook that turns
a candidate into a senior/non-European role results in rejection before any persistence, even
inactive. Final ambiguity produces a review issue. The dedupe callback must be read-only;
mutating any validated field fails with `dedupe_mutated_record` before persistence.

European countries/aliases are matched on word boundaries, fixing matches such as `uk` inside
Milwaukee. The original country list, including transcontinental Russia/Turkey, is retained and
EU/EEA/Europe labels are recognized. Clearly non-European countries/US codes and explicit Europe
exclusions are rejected. Mixed European/non-European locations need review. A missing country,
city-only location or bare Remote/work-from-home is ambiguous: work arrangement is not evidence
of European employment eligibility. The non-European list is finite; unknown locations go to
review rather than a guessed country. There is no geocoding, visa or citizenship inference.

`ScopeDecision.accepted` means a clear scope match; `requires_review` distinguishes ambiguity
from rejection. Both accepted and review records with valid official URLs can be persisted,
but every new row is inactive. A missing URL or identity conflict is held only as a safe review
issue because the unchanged database requires a unique URL. No source is automatically published.
Changes or new review flags deactivate previously active rows; an unchanged clean replay preserves
an existing publication decision. Explicit input attempts to set `is_active=True` fail validation.
An identified duplicate that introduces review requirements also revokes publication without
merging its fields. A later clean replay does not reactivate a held row; an explicit publication
decision remains necessary. Conflicting identities that cannot safely identify one row stay in
the report and are not arbitrarily merged or assigned to a database row.

### Identity priority and conflicting identities

`dedupe.py` supplies a fresh in-memory index for each runner invocation:

1. Exact `(source, source_id)` when an explicit provider ID exists.
2. Canonical official URL.
3. Conservative exact fingerprint of organization + title + location + UTC deadline + type.

Never title alone or fuzzy similarity. Fingerprints require all four facts, no explicit provider
IDs on either record and no embedded job IDs/SPA fragments in the URLs. Unknown query keys also
disable weak fingerprint matching; only `lang`, `language`, `locale` selectors may differ.
Recognized job/position/requisition/posting/opening/vacancy paths disable this fallback as well.
The fingerprint also includes the URL scheme, authority and exact path. Any difference in these
is a distinct URL identity: UUIDs, numeric IDs and opaque slugs are protected in every path
layout, without provider-specific exceptions. Only language query variants of the same address
can use this fallback. Tracking-only variants still match at the earlier canonical-URL stage.
This deliberately prefers retaining possible duplicates over losing distinct postings.
Matching uses normalized case/whitespace for descriptive fields, not guessed employer/city aliases.
Two different explicit
IDs remain separate even with identical descriptive facts. Provider IDs are opaque: internal
spaces, tabs and case are preserved; only outer whitespace is trimmed, matching A14.
Different explicit IDs from the same
provider sharing one URL, ID/URL pointing to different rows, conflicting shared-URL role text,
multiple weak matches, or contradictory URLs for one ID in a single batch produce `identity_conflict`.
They are held for review rather than arbitrarily merged (the first processed candidate is inactive).
A later run can legitimately update the URL for the same provider ID if no other row owns it.

Same-URL cross-provider matches and weak fingerprint matches do not overwrite the original owner's
opportunity fields, source or UUID; a mandatory review can only revoke publication and update its
timestamp. A missing provider ID is stored as deterministic `urlhash:<sha256>` using
the canonical URL; a later provider ID can replace that generated ID only on an exact same-source
URL match, preserving the UUID/application references. Explicit incoming IDs resembling generated
hashes are still treated as explicit IDs; stored generated IDs are recognized by equality with
the hash of that row's URL, not merely by their prefix.

The store preloads identity metadata once per source, not full descriptions per record. This is a
bounded-batch implementation with O(catalogue size) identity memory; large catalogues may need
an indexed canonical-URL strategy later, requiring separate schema/performance review.
Each write uses a savepoint: a rejected insert cannot roll back earlier successful records.
Source commits remain A15 transaction boundaries; a failed source commit rolls back that source,
corrects success counters and does not suppress later sources. Partial generator failures retain
already yielded valid records and mark the source failed. C3 does not add HTTP retry policies.

### Reports for C5/C8

Existing counters remain: fetched, accepted, created, updated, duplicates, rejected, failed,
would_create/would_update; `review_required` is additive and counts each reviewed input once.
`accepted` counts records admitted by initial scope (including review) before validation;
a final scope rejection removes that admission and increments rejected instead. A normalizer
failure occurs before this stage. For A15 compatibility `updated` counts matched
same-source upserts, including no-ops, while timestamps change only for actual data/publication
changes. `duplicates` covers within-batch, weak or cross-source duplicates, not extra database rows.

`IngestionReport.issues` and `to_dict()` add structured diagnostics. Each issue contains source,
record_ref, stage, code, message and outcome. `record_ref(source, identity)` is a stable SHA-256
reference using registered source plus original source_id, original source_url, or `row:N` if
identity cannot be parsed. Consumers can link it to their input without logging a credential URL,
full payload, title or raw exception message. Unsafe source labels are hashed as well.

`report.review_records()` / `to_dict()["review_records"]` identify mandatory review candidates
separately from ordinary inactive rows. Each entry contains source, record_ref, reason codes,
the matched `opportunity_id` UUID when available and `persistence`: `persisted`, `not_persisted`,
`dry_run`, or `rolled_back`. Only successful source commits retain a persisted hold; failed
commits clear the binding and report rollback. Missing URLs and unresolved identity conflicts
have no invented UUID. An ordinary inactive candidate does not appear in this review queue.

The database still has only `is_active`; SQL/API consumers cannot recover the reason for
inactivity from that boolean alone. **Retain the exported structured report** as the C3/C5/C8
review evidence and join persisted entries by opportunity UUID. C3 does not add a review-status
column or conceal metadata in domain fields. A database-native review queue would require a
separately reviewed schema/API change; it is not silently introduced here.

Use `report.export_json(path)` to retain the complete local report, including `review_records`,
without accessing Supabase. The parent directory must exist; choose a different filename for
each run. The method uses exclusive file creation: an existing path raises `FileExistsError`
instead of overwriting previous review evidence. Files are UTF-8 JSON snapshots, readable with
`json.loads(path.read_text(encoding="utf-8"))`. The write is not transactional with the database:
an export failure must be surfaced and retried with a new path; do not discard the report object.

```python
report.export_json("ingestion-report-run-001.json")
```

| Codes | Outcome |
| --- | --- |
| `not_student_role`, `not_stem`, `outside_europe` | rejected |
| `scope_ambiguous` | review; inactive if persisted |
| `deadline_unresolved`, `degree_level_unresolved`, `study_year_unresolved` | review; unknown field stays None |
| `review_required` | review flag supplied by a hook without more specific notices |
| `missing_official_url`, `identity_conflict`, `persistence_conflict` | review; no unsafe merge/insert |
| `invalid_<field>`, `invalid_raw_<field>`, `source_mismatch`, `invalid_record` | failed validation |
| `duplicate_provider_id`, `duplicate_url`, `duplicate_fingerprint`, `duplicate_callback`, `duplicate_stored_identity` | duplicate |
| `normalize_failed`, `scope_failed`, `validate_failed`, `dedupe_failed`, `persistence_failed`, `invalid_store_result` | failed processing |
| `dedupe_mutated_record` | failed; callback attempted to change validated fields |
| `fetch_failed` | source failed; already yielded rows can still commit |
| `source_commit_failed` | source changes rolled back; affected writes count failed |

Raw parse/normalization/validation/dedupe/persistence failures are isolated per record. The report
contains controlled explanations, never raw Pydantic inputs or database exception details. Fetch
failures are source-level events, not fabricated counts of unseen records. Report consumers must
retain the report for review; C3 adds no review table or storage service. Custom adapters that
silently discard records before emitting them cannot be counted by the runner.

### Integration and local verification

```python
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.registry import build_registry

runner = IngestionRunner(OpportunityStore(session), dry_run=True)
report = runner.run(build_registry().resolve())
print(report.render())
summary = report.to_dict()
```

The signatures remain `normalizer(RawOpportunity) -> dict/NormalizedOpportunity`,
`validate(object) -> NormalizedOpportunity`, and `dedupe(NormalizedOpportunity) -> bool`.
Injected stages may extend the defaults but cannot bypass final model validation. The default
within-run deduplicator is still enforced; stateful custom callbacks own their reset policy.
Dry runs execute cleanup, scope, validation, deduplication and read-only classification without
inserts/updates/commit. Smoke fixtures explicitly construct an in-memory SQLite engine.

From `apps/api`:

```powershell
uv sync --locked --all-extras
uv run ruff check .
uv run pytest
uv run python -m opportunity_api.ingestion.smoke
```

The full pytest invocation enforces the project's 80% coverage threshold. Focused tests can run
with `--no-cov`, but do not replace the full coverage check. Tests use only fixtures and temporary
SQLite databases. C5 integration tests exercise the real C4 parsers using saved JSON responses,
without live HTTP or hosted database calls. No schema migration or public API change is needed.

## C8 scheduler and conservative freshness

`scheduled-ingestion.yml` runs fixture-only smoke separately from configured live
sources. It is scheduled **every 10 minutes** (GitHub runs schedules best-effort, on
the default branch after release; a busy hour can delay or skip a slot). A full run
over ~180 sources takes about 4-5 minutes; `concurrency` queues rather than overlaps. Manual dispatch defaults to dry-run.
The live job runs only on main/develop when `INGESTION_ENABLED=true`; it uses the
`ingestion-production` environment and its `INGESTION_DATABASE_URL` secret. No
credentials belong in provider JSON, workflow arguments, artifacts or logs.

Before enabling, Maria/Dalia must review/apply the freshness migration, approve
the exact database target, set the environment's review/access controls and secret,
review a manual dry-run report, and resolve outstanding C6/C7 source integration.
This commit prepares existing ATS operation; it does not pretend C6/C7 are merged.
The scheduled job passes `--publish`: in-scope postings (student role, STEM, Europe or
unrestricted remote) that need no review go live immediately; ambiguous postings stay
inactive for review. Without `--publish` the CLI keeps the inactive review policy.
`--allow-partial` keeps a run green when individual boards fail, but fails when every
source fails; failed sources are still listed in the report and summary.

The same commands are used locally and in Actions (from `apps/api`):

```sh
uv run python -m opportunity_api.ingestion.cli --dry-run --freshness --fail-on-anomaly --report report-preview-001.json
# Persistence requires a separately approved target. Never reset the shared DB.
uv run python -m opportunity_api.ingestion.cli --apply --allow-hosted --freshness --fail-on-anomaly --report report-apply-001.json
uv run python -m opportunity_api.ingestion.summary report-apply-001.json
```

Reports use exclusive output paths. Actions retains JSON artifacts for 3 days and
writes a count/health summary even after a partial failure. Source health notices
make the job fail with `--fail-on-anomaly`, after healthy-source writes have been
retained; failures are explicit rather than silently hiding partial operation.
The existing public HTTP client retries temporary errors at most twice, with
bounded backoff/Retry-After, response size, timeouts and per-host request spacing.
Parser failures are not retried indefinitely. Sources remain isolated by company.

Freshness behavior:

- `last_seen_at` records positive source evidence, including canonical rows still
  observed in records rejected by current scope rules. It is never backfilled.
- `missing_runs` advances once per healthy complete UTC-day snapshot for that
  source. Empty feeds, parse/fetch failures and a drop below 20% of a prior healthy
  volume (baseline >=10) never count as missing. Prior positive baselines survive
  outages. Three healthy missing snapshots inactivate with `source_missing`.
- Known past deadlines inactivate with `deadline_expired`; null deadlines remain
  unknown. These reasons record the inactivation event. Returning rows reset
  missing counts; with `--publish` a returning `source_missing` row goes live again,
  an expired one never does. Without `--publish` reactivation requires review.
- No opportunity is deleted. Dry-run predicts freshness effects without writes.
  Source baselines are server-only and RLS/grants deny browser access.
- New high rejection (>95%) or duplicate (>80%) ratios at volume >=20 are flagged;
  an established baseline must worsen by >20 percentage points to alert again.
- Reports count seen/missing/freshness inactivation, duplicates/rejections/failures
  and missing critical fields. They explicitly say official links were **not**
  checked. A broken link needs a separate audit/review, never blind deletion.

To disable a provider, change its boolean in `providers.json`; to disable one
company, set `enabled:false` in `employers.json`. Disabled companies do not consume
missing-run allowances. To stop all scheduled writes, set `INGESTION_ENABLED=false`.
After a parser/source fix, inspect the retained report, rerun a fresh dry-run with a
new report filename, then reprocess only the approved provider/company configuration.
The CLI never creates schema; it only reactivates returning rows with `--publish`.
