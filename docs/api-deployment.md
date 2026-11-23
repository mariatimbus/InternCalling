# API deployment (Vercel)

The FastAPI backend is a separate Vercel project, `interncalling-api`
(`https://interncalling-api.vercel.app`), with root directory `apps/api`.
The frontend stays in the `interncalling` project.

- `apps/api/api/index.py` exposes the ASGI app; `apps/api/vercel.json` rewrites
  every path to it and bundles `src/**` (including the PDF font).
- Vercel's Git integration deploys `main` to production and other branches to previews.
- `.github/workflows/api-deploy.yml`:

| Trigger | Jobs |
| --- | --- |
| PR touching `apps/api`, migrations or deploy files | `container`: build the Docker image (portable fallback) and run smoke checks |
| Push to `main` (same paths) or manual run on `main` | `container` → `migrate` (Supabase `db push`) → `production-smoke` |

`migrate` and `production-smoke` use the GitHub `production` environment; add Maria
as required reviewer.

## Configuration

**Vercel → `interncalling-api` → Settings → Environment Variables (Production):**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler** URL (port 6543), `postgresql+psycopg://...` |
| `APP_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `APP_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (CV Storage with the user's own token) |
| `CORS_ORIGINS` | `https://interncalling.vercel.app` |
| `APP_DEBUG` | `false` |
| `APP_OLLAMA_URL` | optional; empty disables AI matching and CV extraction |

**Vercel → `interncalling` (web):** `NEXT_PUBLIC_API_BASE_URL` and `API_BASE_URL` =
`https://interncalling-api.vercel.app`, plus `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `AUTH_APP_ORIGIN`.

**GitHub → Environments → `production`:** secrets `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`; variables `SUPABASE_PROJECT_REF`, optional `API_PUBLIC_URL`.

## Serverless notes

- With `VERCEL` set, SQLAlchemy uses `NullPool` (a connection per request), and
  psycopg prepared statements are disabled, as the transaction pooler requires.
- Request bodies are limited to 4.5 MB by Vercel, so CVs larger than that fail
  even though the API accepts 5 MiB. The web app's proxy has the same limit.
- Functions run for at most 60 s (`maxDuration`); slow CV extraction may time out.
- The in-memory rate limiter is per function instance, so it is weaker than on a
  single server. Use Vercel's firewall rules if abuse appears.
- `/dev/console` is only mounted when `APP_DEBUG=true`; the smoke test fails if it is reachable.
- Rollback: Vercel → Deployments → promote the previous deployment. Migrations are
  forward-only; ship a corrective migration instead of editing an applied one.
- `apps/api/Dockerfile` remains a tested, portable fallback for container hosts.
