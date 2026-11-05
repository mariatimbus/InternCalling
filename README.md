# InternCalling

A Student Opportunity Intelligence Platform: one place to discover, track, and manage
internships, jobs, scholarships, hackathons, and grants.

## Brand

The application is named **InternCalling**. Frontend branding uses the original InternCalling logo and a dark navy/blue/violet theme with a scroll-responsive gradient. UI strings, metadata, package display names and new documentation use this name.

Existing GitHub URLs, Notion resources, Supabase project identifiers, legacy SQLite filenames and applied SQL migrations retain their actual historical identifiers. They are infrastructure references, not the product's display name. Do not rename or reconnect those resources as part of a visual rebrand.

## Overview

This repository is a monorepo:

- `apps/web` — Next.js frontend
- `apps/api` — FastAPI backend
- `services/ai` — AI services (Ollama adapters)
- `services/ingestion` — opportunity ingestion services
- `packages/` — shared packages (types, config)
- `supabase/` — versioned SQL migrations, RLS tests and shared development setup
- `database/` — legacy Alembic references and seed fixtures

## Quickstart

1. Clone the repo.
2. `cp .env.example .env` and configure the shared Supabase project URL and hosted database connection. ES256 Auth uses public JWKS; no JWT secret is required.
3. Backend: see `apps/api/README.md` (uses `uv` + Python 3.13).

See `docs/architecture.md` for structure and `docs/contributing.md` for workflow.

## Shared database setup

Follow [the Supabase team guide](supabase/README.md) to connect to the shared development project, apply committed migrations and run RLS tests. Normal team development uses the shared hosted Supabase project.
