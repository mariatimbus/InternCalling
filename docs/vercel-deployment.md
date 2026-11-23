# Frontend deployment

Vercel project `interncalling` is linked to `mariatimbus/InternCalling` in
`marias-projects-f11fb6bc`, with root directory `apps/web`, framework Next.js,
and production branch `main`. Build/install commands are versioned in
`apps/web/vercel.json`; Node 22 matches GitHub CI.

Pipeline:

1. Open a pull request. Existing GitHub workflows run backend tests, frontend
   lint/types/tests/build, ingestion checks, migration/RLS tests, security
   audits and desktop/mobile browser tests. Vercel builds a preview.
2. Merge a passing pull request to `main`. The native Vercel Git integration
   automatically builds and publishes production. A failed build does not
   replace the last successful production deployment.
3. The `Vercel production smoke` workflow checks public pages and guest access
   after Vercel reports a successful Production deployment. It can also be run
   manually from `main`. It does not certify authenticated backend behavior.

GitHub does not need a copied Vercel token or deployment hook secret. Vercel's
installed GitHub integration owns deployment authorization. Existing CI remains
separate from deployment; only merge passing PRs. The repository's branch
protection configuration has not been changed.

## Production variables

Set these in the **interncalling** Vercel project's Environment Variables for
Production. Configure Preview separately with the intended development services.
Redeploy after changing variables, because public Next.js values are built into
browser bundles.

- `NEXT_PUBLIC_API_BASE_URL`: public HTTPS FastAPI origin, without `/api/v1`.
- `NEXT_PUBLIC_SUPABASE_URL`: intended hosted Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: that project's browser publishable key.
- `AUTH_APP_ORIGIN`: `https://interncalling.vercel.app` (or your approved custom
  domain). Add the corresponding Auth callback/recovery URLs in Supabase.

Never put database passwords or elevated Supabase credentials in public values.
The API must allow the frontend origin in credentialed CORS. FastAPI and its
schema are deployed separately; Vercel frontend hosting does not start the API.
No production API or Supabase settings were invented or copied from other apps.
Without the production variables, the public frontend can deploy, but account
and workspace operations remain unavailable.

## Verification and rollback

Run `DEPLOYMENT_URL=https://interncalling.vercel.app node scripts/deploy/smoke.mjs`
for the public check. Then verify signup/signin, onboarding, profile persistence,
recommendations and tracking against the intended hosted backend. Do not use
synthetic E2E credentials or localhost endpoints in production.

For a bad application release, promote a previously verified deployment in
Vercel, or revert the GitHub release through a passing PR. Database migrations
and data require their own compatibility review; a frontend rollback does not
roll back schema changes.
