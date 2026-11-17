# GitHub publication checkpoint — 17 November 2026

Eight task branches are prepared for the explicitly authorized GitHub push to
`mariatimbus/InternCalling`. Publication is verified separately against remote
commit IDs; this document does not assert a merge, deployment or hosted migration.
Earlier sections below describe the historical local checkpoints.

- Full local release verification: all ten checks passed (470 backend tests,
  93.36% coverage, migrations/two-user RLS, seed replay, frontend checks and four
  desktop/mobile browser tests).
- Gitleaks scans covered each new branch history and exact develop-to-head diff;
  no secrets were found. Original uncommitted user changes are excluded.
- Root npm audit and locked production Python pip-audit were clean.
- A scoped minimatch override resolves its tooling advisory. Production web npm
  audit is clean; full tooling audit still reports 14 high affected packages
  through the unpatched picomatch advisory. See
  `docs/audits/2026-11-17-web-dependencies.md`; security CI remains a review gate.
- CI/config review found read-only workflow token permissions, secret references
  instead of credentials, and guarded/disabled hosted ingestion. No deployment
  was enabled and no privileged browser key was introduced.

Branches: `feature/maria-profile-v2`, `feature/maria-global-recommendations`,
`feature/bianca-job-tracker`, `fix/maria-web-security`,
`fix/maria-release-hardening`, `feature/maria-ollama-service`,
`feature/dalia-ingestion-schedule`, `feature/maria-semantic-matching`.
These are dependent task branches, not eight independent changesets. Review the
independent security fix first, then profile → recommendations → tracker →
hardening → CV → scheduler → benchmark, refreshing dependent branches as
prerequisites merge. Ordinary PRs target develop; none has been opened by this run.

Remaining blockers: hosted Supabase connection/approved Auth and Storage checks,
C6/C7 integration and source remediation, final live data/link QA, upstream tooling
security fix, human reviews, deployment configuration and release approval.
No task is marked Done from local tests or branch publication alone.

---

# Continuation status — 17 November 2026

The newest combined local stack is in `/private/tmp/opportunity-semantic-benchmark`
on `feature/maria-semantic-matching`. The original checkout's code edits remain
preserved. Nothing has been pushed, merged, deployed or applied to shared Supabase.

## Additional local task commits

- A11: `30f7a16` adds the shared Ollama client, private CV upload/download/deletion,
  bounded process-isolated PDF/DOCX extraction, strict grounded drafts, explicit
  selected-field review, conflict protection and provenance. Follow-up `3a91661`
  on the A11 branch fixes prompt/thinking behavior and deterministic test archives;
  it is replayed as `3c53f7d` in this combined stack.
- C8: `b508f02` adds guarded daily/manual ingestion, source health, reports/artifacts,
  and conservative last-seen/missing/expiry tracking. Scheduled hosted execution
  remains disabled pending target/secrets/migration approval and C6/C7 integration.
- A12: `03bf273` adds synthetic golden ranking metrics, model/template identity,
  bounded per-run embedding caching, and semantic bonus bounds. Actual local model
  results are recorded in `docs/benchmarks/semantic-matching.md`. No pgvector or
  semantic global ranking was enabled.

## Verification

- 470 backend tests passed, 93.36% coverage; Ruff and diff checks passed.
- All ten combined local release checks passed, including fresh disposable
  PostgreSQL migrations, two-user CV Storage/metadata RLS, source-state privacy,
  seed replay, frontend lint/types/26 unit tests/build, and 4 desktop/mobile
  Playwright/axe tests.
- Locked production Python dependencies: pip-audit found no known vulnerabilities.
  Previous web production audit was clean; seven moderate tooling advisories remain
  from the previously declined automatic fix.
- A synthetic CV was extracted and schema/evidence-validated by the installed
  local `qwen3.5:4b-mlx` model; no real CV or profile writes were used for that smoke.
- Real `nomic-embed-text` comparison on the synthetic set improved mean NDCG@3
  from 0.7791 to 0.9001 and Precision@3 from 0.50 to 0.67. It needs independent
  review/expansion before any production quality or storage decision.
- Local history was checked for private-key/live-token signatures; none matched.
  This limited check does not replace the required full gitleaks/security pass
  before a future push. No push was performed.

## Live-source findings and remaining gates

Read `docs/audits/2026-11-17-live-ats.md`: Databricks yielded 893 postings / 11
candidates, Palantir 303 / 46. Databricks also had two oversized location values;
BoschGroup's SmartRecruiters endpoint was disallowed by robots. The CLI correctly
reported partial/source failure. No hosted data changed, and failed sources did
not consume missing-run allowances. Live ingestion is not declared healthy.

A11/A12/C8 were set to In Progress in Notion; no task was marked Done. Still needed:
approved hosted Storage/Auth/RLS verification; retention/orphan cleanup policy and
CV frontend review integration; C6/C7 completion and ATS source remediation; a
representative reviewed ranking benchmark; final data/link QA; GitHub review/checks
and branch protections; deployment targets/configuration and release approval.

---

The earlier core-integration handoff follows for branch history.

# Core integration status — 17 November 2026

Local work is ready for review, pending the hosted checks below. Nothing has been
pushed, merged, deployed or applied to shared Supabase. The original checkout and
its user edits remain on `feature/maria-backend-coverage`.

## Local branch stack

| Branch | Task | Local commits |
| --- | --- | --- |
| `feature/maria-profile-v2` | Profile API/preferences, migration, matching inputs | `d8bec28`, `6368044` |
| `feature/maria-global-recommendations` | Global deterministic ranking + frontend explanations | `426224a` |
| `feature/bianca-job-tracker` | Save/Apply/status/notes + API persistence | `d84ded0` |
| `fix/maria-web-security` | Independent Next.js security patch | `c6fc9ab` |
| `fix/maria-release-hardening` | Combined stack, browser tests and release verification | security patch replayed as `2e8b74c`; hardening commit follows |

The feature branches are stacked in the order above; the security branch starts
from develop independently. Before opening PRs, refresh develop and retarget/rebase
only the unshared local task branches as prerequisite PRs merge. Target ordinary
PRs to develop. Reviewers: Maria/Dalia for migration and RLS, Bianca/Maria for UI/API.

## Verified locally

- 423 backend tests passed, 96.03% coverage; Ruff passed.
- Fresh disposable PostgreSQL migration replay, two-user RLS, and seed idempotency passed.
- Frontend lint, typecheck, 26 unit tests, and webpack production build passed.
- Desktop/mobile Playwright core flow and cross-user API tests passed; axe found
  no violations in the tested tracker content and no horizontal overflow.
- `scripts/release_check.py --webpack` passed all ten local checks.
- Next.js is patched to 16.4.6. Production dependency audit: zero vulnerabilities.
  Full web audit: seven moderate development-tooling advisories. Automatic
  transitive audit fixes were declined, so they remain outstanding.
- Local history/diff/new executable files were checked for private-key/live-token
  signatures; none matched. E2E uses explicitly labeled synthetic identities and
  a loopback-only fixture signing key. This signature check does not replace the
  repository's full gitleaks/history review before any push.

## Remaining gates and scope

- Apply/review `supabase/migrations/20261117120000_profile_v2.sql` only in approved
  development Supabase; then verify real hosted Auth and two-user RLS. No shared
  database changes were made by this work.
- GitHub CI has not run for these local commits. No PR or review is claimed.
- Verify hosted confirmation/recovery/provider redirects and production settings.
- Configure branch protections, hosting, production variables, CORS and deployment
  smoke checks only after the exact target/configuration has been approved.
- CV Storage/extraction/review, semantic benchmark, scheduled ingestion/freshness,
  live-source audits and final data QA remain separate tasks. See
  `docs/beta-verification.md`; local core-flow success does not complete the beta.

Notion task bodies B6/B7 appear swapped relative to their titles. Implementation
follows their explicit acceptance criteria; no task was marked Done.
