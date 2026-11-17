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
