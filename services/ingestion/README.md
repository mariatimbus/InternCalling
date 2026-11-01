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

## Pipeline (A14 / A15 / C3)

The automated ingestion path is distinct from the reviewed C2 seed importer:

```text
adapter -> RawOpportunity -> normalize/clean -> scope -> validate -> final scope -> dedupe -> persist -> report
```

C3 is entirely offline. It adds no database columns, migrations, public endpoints or dependencies.
`RawOpportunity`, `SourceAdapter`, `NormalizedOpportunity` (still importable from `persistence`)
and `IngestionRunner.run(adapters)` retain their existing interfaces. Real HTTP adapters belong
in C4; the registry currently provides the interface and fixture-backed smoke path only.

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
from opportunity_api.ingestion import registry

runner = IngestionRunner(OpportunityStore(session), dry_run=True)
report = runner.run(registry.resolve())
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
SQLite databases. No C4 adapter, Supabase hosted call, schema migration or API change is needed.
