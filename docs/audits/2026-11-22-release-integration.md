# GitHub integration audit — 22 November 2026

Candidate: `release/2026-11-22-integration`, intended target `main`.

## Reconciliation

Main `fffa753` and develop `05d3fc7` had diverged because older releases were
squashed. Main's complete tree exactly matched the `release/pre-beta` commit
already contained in develop. The reconciliation preserves this release history
and the current develop tree, then integrates the outstanding task stack.

The candidate preserves B4's profile/resume hub, B5's jobs/search/filter layout,
and their tests. Recommendations now use the global ranked endpoint before
pagination, without per-page match requests. Saved/Applied views and the tracker
retain canonical API-backed status/notes/remove controls. Profile preferences and
profile editing use separate server action modules and coexist in the hub.

It includes Profile v2, recommendation ranking, application integration, the
Next.js/minimatch security update, browser/release hardening, private CV backend,
Ollama extraction, the synthetic semantic benchmark, guarded ingestion/freshness,
read-only catalog/link audits and the previously unpushed CORS validation.

Older foundation/design branches were audited as superseded by merged B3/B4/B5
work; their old screens are not resurrected over newer implementations. The
unique developer console was recovered from `chore/maria-dev-console`, restricted
to APP_DEBUG, and tested to return only validated public configuration. The
production default has no console routes. Existing feature branches are retained.

## Problems found and resolved

- Reconciled main/develop release-history conflicts and eight UI/lockfile conflicts.
- Combined current UI with ranking, preferences, eligibility explanations and
  application controls instead of replacing either workstream.
- Updated integration fixtures to the global recommendations response and retained
  assertions that no page-local match requests are made.
- Fixed onboarding's initial HTTP 500: pass serializable manual-profile data into
  the client flow rather than cloning a client element supplied through RSC.
  Browser regression checks now fail on any server 5xx or uncaught page error.
- Installed locked Python fixture dependencies in Frontend CI before its unit
  tests; the new matching integration test requires the actual backend environment.
- Rechecked dependency advisories without weakening CI gates: current root/web npm
  audits and locked Python pip-audit report zero known vulnerabilities.

## Verification and limits

The release checker runs backend lint/tests/coverage, ingestion fixture smoke,
fresh disposable PostgreSQL migrations and two-user RLS, seed idempotency,
frontend lint/types/unit tests/production build and desktop/mobile browser/axe
checks. Full Git history and the exact release diff are separately scanned with
Gitleaks. GitHub checks must run on the published candidate before merge.

Hosted Supabase migrations/Auth/Storage, real-email/provider redirect behavior,
approved live catalog data, blocked ATS sources and production deployment remain
external verification gates. No hosted schema/data, credentials or deployment
settings were changed by this integration. The scheduled persistence job retains
its repository-variable/environment gate. Optional UI capabilities that still
lack connected services remain explicitly unavailable rather than using fake
persistence. Local fixture success does not certify those hosted capabilities.

Final local result: all ten release checks passed. The backend suite passed 559
tests with coverage above the 80% gate; all 256 frontend unit tests and four
desktop/mobile browser/authorization tests passed. Browser tests also verified
accessibility, overflow, no server 5xx and no uncaught page errors. Production
build, fresh migrations/two-user RLS and seed replay passed. Development server
logs may include aborted-navigation cancellation messages; the tested browser
requests had no 5xx responses and all assertions passed.
