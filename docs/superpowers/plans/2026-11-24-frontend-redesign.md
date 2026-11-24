# Frontend redesign and English catalog implementation plan

> **For agentic workers:** Use executing-plans to implement this plan task by task.

**Goal:** Replace the dark interface with a cohesive, readable student workspace and display consistently formatted English opportunities without ATS markers.

**Architecture:** Keep the existing Next.js components, authentication and Supabase catalog. Use shared semantic design tokens and compact opportunity rows. Build content-addressed English translations locally from public catalog text; never overwrite employer originals or run a model in a page request. Missing or stale translations must safely fall back to the source.

**Tech stack:** Next.js, React, Tailwind, FastAPI, existing local Ollama service.

**Visual specification:** The user's supplied white opportunity list, structured detail and CV profile screenshots, using the mandatory InternCalling blue/navy/warm-white palette. Mode: Operate (workspace), Read (description). The existing dark interface is the rejected reference. Keep company logos, infinite loading, matching, tracking, profile editing and authentication.

**Branch:** Continue the authorized uncommitted frontend work on `fix/bianca-integrate-copilot`; do not discard changes or alter divergent history. No commit, push, shared database change or deployment.

## Tasks

- [x] Replace global surface, text, border and control tokens; remove decorative background animation. Refine shell, navigation, cards, typography and public lists together.
- [x] Add regression tests for ATS cleanup (including escaped/mixed-case tags), real work-mode facts and links; use one description formatter for previews and detail.
- [x] Generate and validate English title/description translations with a local model, cached by original content hash; expose only presentation text, preserving source data and deterministic matching.
- [x] Verify unit tests, typecheck, lint and production build; inspect desktop/mobile screenshots with accessibility checks and infinite loading.
- [x] Obtain a fresh finish review, resolve material issues, and document the resulting design system and local translation operation.

## Review and limits

Fresh finish review requested one material correction: the selected reader had too little vertical room at 1280×720. Search controls now occupy the list column; the reader starts at y92 with approximately 546px of content space. The reviewer scored that fix resolved and returned `ship` at that scope. E2E verifies the minimum reading area and a long structured description as well as the existing account, profile, matching and tracking workflows.

DESIGN.md and .impeccable/design.json describe the implemented light system. English translations are derived local cache artifacts, not database edits or deployment changes. See docs/english-catalog.md. Search still uses the original employer text; deployment requires cache preparation. No commit, push, PR or shared Supabase change was performed.

## Verification results

- Frontend: 313 unit tests passed; typecheck and ESLint passed; Webpack production build exited 0.
- Backend: 697 tests passed with 92.26% coverage; Ruff passed. Run pytest from apps/api because smoke fixtures use that working directory.
- E2E: 4/4 passed on desktop/mobile with a 120-second per-test allowance for local compilation and screenshot capture. Includes the long-description reader-height regression and account isolation.
- Public browser matrix: Home, Explore and sign-in at 1440, 390 and 320px: no overflow, JavaScript errors or tested WCAG violations.
- Infinite loading: 12→24 on desktop/mobile; order retained, search reset, failure/retry and nested-main scrolling passed.
- Live local catalog: 191 active, zero non-English classifications across the supported languages, zero standalone ATS markers. Translation is automatic; no editorial accuracy claim is implied by language detection.
- Final API health and frontend Explore returned HTTP 200; managed services remain detached from the tool session.

## Review focus

- Public and workspace cards must share density and hierarchy without nested interactive targets.
- Light surfaces need readable secondary text, focus, error and selected states.
- Remove only ATS hashtags, preserving Hybrid/Remote prose, URLs and ordinary content.
- A cache entry for an old source description must never replace a newer posting.
- Translation failure must not hide catalog data, block requests or change eligibility facts.
