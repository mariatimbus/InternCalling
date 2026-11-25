# Core flow browser verification

Install the web lockfile and backend dependencies, then:

```sh
cd apps/web
npx playwright install chromium
npm run test:e2e
```

`E2E_PYTHON=/absolute/path/to/python` selects an existing backend environment;
otherwise the runner uses `uv run --project ../api python`.

Playwright starts loopback-only Auth protocol doubles on 8300/8301, the real
FastAPI application with disposable SQLite fixtures on 8302, and Next.js on 3102.
Nothing connects to hosted Supabase or sends email. Test signing keys are public
synthetic fixture values, never usable with a hosted account. Ports must be free.

Desktop and mobile tests cover signup/confirmation protocol, onboarding, profile,
recommendation filters/explanations, save, statuses, notes, refresh,
removal, two-user API denial, axe checks, and horizontal overflow. Screenshots
and failure traces are saved in `test-results/` and uploaded by the E2E workflow.

Auth-provider delivery/configuration and PostgreSQL RLS are separate checks:
`npm run db:test:fresh` verifies real disposable PostgreSQL policies with two users.
Hosted signup/recovery/provider redirects still need the approved development
project and production configuration review.
