# Skills catalog importer: Maria/Dalia review and runbook

Implemented locally on feature/bianca-profile-resume-hub, 17 November 2026.

## Confirmed approved import and reporting correction

The approved catalog has already been imported into the explicitly confirmed project `eabtzresfdzekvqpyrrx`: **143 total records, all 140 approved names present, 132 inserted**. Existing records, IDs, names and user/opportunity associations were preserved. This is the previously confirmed operation, not a new database verification in the final delivery task. It is not pending and must not be repeated merely to test idempotency.

The successful import printed `inserted: -132` because its driver reported an unknown row count of `-1` for each insert. The reporting fix counts rows returned by `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, rather than driver row counts. Insert-only semantics, validation, locking, transaction/rollback and association handling remain unchanged. Nineteen isolated importer tests pass, including negative, missing, zero and inflated driver row-count cases, idempotency, association preservation and rollback. No shared apply was run for this fix.

Maria/Dalia must resolve a documentation/environment discrepancy before any future shared operation: the previously confirmed configured project was `eabtzresfdzekvqpyrrx`, while `supabase/README.md` referenced `fnldapsomswemayxhayk`. A shared pooler host is not a unique project identifier. Do not assume either reference applies to only one environment or change hosted settings to reconcile them.

The original preparation/comparison notes below are historical. Their pending-approval language and projected totals are superseded by this confirmed result. Future additions still require vocabulary review and exact target confirmation.

## Scope

- Module: apps/api/src/opportunity_api/ingestion/skills_catalog.py
- Tests: apps/api/tests/test_skills_catalog.py
- Input: [skills_catalog.proposed.json](skills_catalog.proposed.json)
- Vocabulary/matching context: [SKILLS_CATALOG_PROPOSAL.md](SKILLS_CATALOG_PROPOSAL.md)

The earlier proposal's statements that an importer is not implemented / the JSON is not importer input describe its original preparation state. This module now explicitly supports that file; proposal-only status is retained as a reminder that --apply is technical consent to write, not evidence of vocabulary approval. The data file itself is unchanged.

No API contracts, matching rules, frontend fallback, schema, RLS, environment files or dependencies change. Aliases/categories stay review metadata; only canonical skill names can be inserted. Existing combined legacy names remain untouched.

## Prerequisites and target selection

Use the original repository root and the existing Python >=3.13 backend virtual environment, SQLAlchemy, Pydantic and psycopg from apps/api/pyproject.toml. For a new reviewer checkout, the documented backend setup is uv sync --project apps/api; it was not run or needed for this implementation.

The importer uses the existing backend Settings configuration: process DATABASE_URL / APP_DATABASE_URL, or the root .env when run from the repository root. It refuses the implicit default SQLite fallback. For an existing SQLite target, its file and schema must already exist; the importer never creates either. Shared operation should target the approved Supabase PostgreSQL database with appropriate catalog SELECT/INSERT and table-lock permissions, configured privately through the team's existing mechanism. Do not paste a connection string into a review, report or screenshot.

Verify the exact Supabase project/environment privately with Maria/Dalia. The report shows only dialect, host, port and database; a shared Supabase pooler hostname plus database postgres does not uniquely identify a project. A successful dry run is not permission to write.

## Exact PowerShell commands

Run from the original worktree root:

~~~powershell
Set-Location 'C:\Users\nan77\OneDrive\Desktop\OPPORTUNITY TRACKER\InternCalling-B3'

# Read-only comparison: default mode, no --apply.
uv run --no-sync --project apps/api python -m opportunity_api.ingestion.skills_catalog

# Optional explicit input; still read-only.
uv run --no-sync --project apps/api python -m opportunity_api.ingestion.skills_catalog --catalog database/seeds/skills_catalog.proposed.json

# ONLY after vocabulary approval and private confirmation of the configured target:
uv run --no-sync --project apps/api python -m opportunity_api.ingestion.skills_catalog --apply
~~~

Equivalent commands with the already installed virtual environment (used for this task):

~~~powershell
& '.\apps\api\.venv\Scripts\python.exe' -m opportunity_api.ingestion.skills_catalog
# Authorized reviewer only, after the same approvals:
& '.\apps\api\.venv\Scripts\python.exe' -m opportunity_api.ingestion.skills_catalog --apply
~~~

No URL CLI argument is accepted. Do not use the opportunity publication/ingestion scripts to add this vocabulary.

## Validation, reports and failure behavior

Input validation finishes before configuration/database access. It checks schema version/status, exactly 140 skills, nine unique categories and matching counts, normalized canonical names, API name limits, unique canonical names/aliases, alias collisions, and tokenizer compatibility metadata. Invalid input prints a generic credential-safe error and exits 2.

The JSON comparison includes existing entries (IDs/names), reuses, proposed additions, counts, ambiguities, can_apply, mode and inserted. It does not report user details, associations, credentials or SQL. Proposed additions are candidate names, not evidence they were inserted.

Normalization reuses profile._normalize_skill_name (strip/lower). A single normalized existing record is reused with its original UUID, spelling and timestamps. Any group of existing normalized-name duplicates blocks the whole apply. Existing rows matching a proposed alias are reported separately and also block apply, even if a canonical row already exists. Aliases are not treated as equivalence, used to select a canonical record, inserted, renamed or merged. Review ambiguities separately; do not delete legacy records or reassign links to make the importer pass.

Dry-run takes a PostgreSQL READ ONLY transaction before selecting public.skills. SQLite CLI dry-runs open the existing file in URI mode=ro and additionally enable query_only. No INSERT/UPDATE/DELETE/schema DDL is sent in dry-run. PostgreSQL uses a 30-second statement timeout.

Apply:
1. Opens one transaction and locks public.skills in SHARE ROW EXCLUSIVE mode (five-second lock timeout), serializing catalog/profile inserts while allowing reads. SQLite test applies use BEGIN IMMEDIATE.
2. Re-reads and compares inside that transaction; never relies on a previous dry-run report.
3. If any ambiguity exists, inserts nothing and exits 2 with a blocked report.
4. Inserts missing canonical names with fresh UUIDs and ON CONFLICT(name) DO NOTHING. It never updates/deletes a skill or touches either association table.
5. Commits all additions together, or rolls them all back on failure. Database errors print only a generic message and safe target identity; no driver exception/connection string is printed. Exit 1 indicates configuration/connection/import failure.
6. A repeat on unchanged data reports zero additions/inserts and does not update timestamps.

A successful dry-run with ambiguities exits 0 because comparison completed; can_apply=false is the review signal. --apply is blocked until ambiguities disappear. Runtime writes by other clients after the import are not governed by this tool; the schema still lacks case-insensitive uniqueness, and custom user additions remain permitted.

## Verification performed

- 15 focused tests passed using the repository's fresh in-memory SQLite fixture and disposable tmp_path SQLite files only.
- Tests cover read-only default, all 140 additions, repeated execution, normalized-name reuse without renaming, preservation of IDs/timestamps and both association tables, name/alias ambiguity blocking, invalid input before DB access, rollback after a late insert failure, missing-file protection, and credential-safe CLI errors.
- Full backend suite: 339 passed, 109 warnings, 95.55% coverage (configured minimum 80%); Ruff check apps/api passed. Existing test warnings were reported, not suppressed. The first full-suite invocation from the repository root hit an existing relative-fixture path assumption; the suite was rerun from apps/api as documented.
- PostgreSQL apply/locking under contention was not executed against any shared database. SQLite tests validate transactional import behavior; they do not replace a disposable PostgreSQL concurrency/RLS/permissions check before shared apply.

To repeat checks using the existing environment:

~~~powershell
Set-Location 'C:\Users\nan77\OneDrive\Desktop\OPPORTUNITY TRACKER\InternCalling-B3\apps\api'
& '.\.venv\Scripts\python.exe' -m pytest tests/test_skills_catalog.py --no-cov -q
& '.\.venv\Scripts\python.exe' -m pytest -q
& '.\.venv\Scripts\python.exe' -m ruff check .
~~~

The focused command disables the global coverage threshold only for that partial run; the full suite uses the normal configured coverage requirement.

## Historical configured-target comparison (read-only, 17 November 2026; before approved import)

- PostgreSQL host: aws-1-eu-central-1.pooler.supabase.com; port: 5432; database: postgres.
- 8 existing skills; 6 canonical reuses; 134 proposed additions; 0 normalized-name/alias ambiguities; 0 inserts.
- Existing names: c/c++, data structures and algorithm, git, java, javascript, object-oriented programming, python, typescript.
- Compared with the previous seven-entry observation, git now exists. This tool did not create it.
- The two combined legacy entries would remain; with no intervening changes, an approved apply would result in 142 rows. This is a projection, not an applied result.
- Target project identity and vocabulary approval remain human review steps. Matching's multiword/alias limitations from the proposal remain unchanged.

Recommended next step: review vocabulary and this diff with Maria/Dalia, confirm the exact target, test PostgreSQL apply/lock behavior in a disposable environment, then have an authorized reviewer rerun dry-run immediately before any approved --apply.
