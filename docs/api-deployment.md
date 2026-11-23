# API deployment (Render)

The FastAPI backend runs on Render as a Docker web service; the frontend stays
on Vercel. Pipeline: `.github/workflows/api-deploy.yml`.

| Trigger | Jobs |
| --- | --- |
| PR touching `apps/api`, migrations or deploy files | `container`: build image, non-root check, local smoke test |
| Push to `main` (same paths) or manual run on `main` | `container` → `migrate` (Supabase `db push`) → `deploy` (Render) → production smoke |

`migrate` and `deploy` use the GitHub `production` environment. Configure it with
Maria as required reviewer so every production change is approved by a human.

## One-time setup (Maria)

1. **Render:** New → Blueprint → this repository (`render.yaml`). Enter the secret
   env vars in the Render dashboard: `DATABASE_URL` (Supabase pooled Postgres URL,
   `postgresql+psycopg://...`), `APP_SUPABASE_URL`, `APP_SUPABASE_PUBLISHABLE_KEY`,
   `APP_SUPABASE_JWT_SECRET` (only if the project still uses HS256 tokens),
   `APP_OLLAMA_URL` (optional; empty disables AI features and CV extraction).
   `autoDeploy` is off: only the workflow deploys, after migrations.
2. **Render → Settings → Deploy Hook:** copy the URL.
   **Render → Account → API Keys:** create a key.
3. **GitHub → Settings → Environments → `production`:**
   - secrets: `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`, `SUPABASE_ACCESS_TOKEN`,
     `SUPABASE_DB_PASSWORD`
   - variables: `RENDER_SERVICE_ID` (`srv-...`), `API_PUBLIC_URL`
     (e.g. `https://opportunity-api.onrender.com`), `SUPABASE_PROJECT_REF`
4. **Vercel:** set `NEXT_PUBLIC_API_BASE_URL` and the server-only `API_BASE_URL` to
   `API_PUBLIC_URL`, `AUTH_APP_ORIGIN=https://interncalling.vercel.app`, then redeploy.
5. Run the workflow once manually on `main` and check that every job is green.

## Notes

- The image runs `uvicorn` as UID 10001 with `--proxy-headers`, so the per-IP rate
  limiter sees real client addresses behind Render's proxy. The container port
  is not publicly reachable except through that proxy.
- `/dev/console` is only mounted when `APP_DEBUG=true`; production keeps it off
  and the smoke test fails if it is reachable.
- `CORS_ORIGINS` must list the exact Vercel origin. Add preview origins only
  deliberately; wildcards are rejected by the settings validator.
- Rollback: Render → Deploys → *Rollback* to the previous live deploy. Migrations
  are forward-only; ship a new corrective migration instead of editing an applied one.
- First run: confirm that the deploy hook accepts `&ref=<sha>` and returns
  `deploy.id`. If the response format differs, the workflow stops before smoke tests.
