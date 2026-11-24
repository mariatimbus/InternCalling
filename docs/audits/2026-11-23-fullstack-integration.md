# Frontend/backend integration verification

The real profile screens now use authenticated services for all six collections,
private PDF storage/access/removal, manual/CV onboarding, reviewed imports and
persisted source-based tailored resumes with exact approved-content PDF export.
Development fixture services remain isolated to development pages.

Validation:

- All ten local release checks passed: backend lint/tests, ingestion smoke,
  migration replay with two-user RLS, seed idempotency, web lint/types/tests/build,
  and desktop/mobile browser flows.
- 580 backend tests (92% coverage), 264 frontend tests, four browser tests.
- Browser flows exercise signed-in project persistence across reloads, private
  PDF upload/access/removal and actual approved-resume export, alongside existing
  auth/onboarding/ranking/tracking/accessibility coverage.
- Atomic review, durable retry receipts, stale source/draft rejection and
  cross-owner reads/writes/exports are verified by backend/RLS tests.
- Legacy CV operations share the owner lock; 36 focused compatibility tests
  passed after adding that lock.
- Both npm audits and the complete registry Python lock audit found no known
  vulnerabilities. The packaged wheel includes the licensed local Unicode font.

Vercel frontend hosting and the main-branch deployment/smoke pipeline were
verified separately. Hosted account workflows remain unverified until the
intended production API URL, Supabase settings and migrations are configured.
No hosted database schema/data or production account credentials were changed.
Private uploaded revisions remain archived until deleted through the CV API;
removing the active PDF never reactivates an older upload.
