# Beta verification and review handoff

Local verification (after installing root/web lockfiles and API dependencies):

```sh
uv run --project apps/api python scripts/release_check.py
# Supported alternative for environments where Turbopack cannot bind helper ports:
uv run --project apps/api python scripts/release_check.py --webpack
```

The report lists actual results and unverified hosted/release gates. Skipping
E2E produces a partial result and exit code 2. The command never applies hosted
migrations, changes branch protections, publishes data or deploys an application.

Review the additive Profile v2 migration before applying it to approved development
Supabase. Verify two real users there; disposable PostgreSQL checks use stubbed
Auth interfaces and browser E2E uses local Auth protocol doubles. Validate email
confirmation/recovery, revoked sessions, cross-tab logout, Google/LinkedIn and the
production redirect allowlist against the intended hosted project.

Before release, audit active data with Dalia (sources, duplicates, eligibility,
locations, deadlines, official links, stale records). Scheduled ingestion,
conservative freshness/expiry and live-source alert thresholds still require their
own reviewed task. Optional CV extraction must remain owner-only, schema-validated,
and subject to student review; semantic matching needs a measured benchmark.

CI changes add post-merge checks on develop/main and a separate browser core-flow
job. Task-branch publication alone does not run those PR/protected-branch checks.
Branch protection and production hosting remain administrator configuration.

Deployment must specify web/API hosting, server-only database credentials, allowed
CORS origins, Supabase production project and redirects. Before changing shared
resources, prepare the exact config diff and obtain the repository-required
approval. Run health and core-flow checks after deployment. Roll back application
releases separately from additive database changes; do not reset the shared DB.

Next.js was patched to 16.4.6. Production dependency audit passed locally. A scoped
minimatch override resolves its advisory; 14 high affected tooling packages remain
through unpatched picomatch. See `docs/audits/2026-11-17-web-dependencies.md`.
The full dependency audit and security CI are not clean.

For read-only duplicate/expiry/freshness/eligibility and bounded official ATS link
checks, use `scripts/catalog_audit.py` as documented in `docs/catalog-audit.md`.
A partial public API page cannot certify the catalog; offline success does not
certify live link health. No hosted catalog audit has been performed.
