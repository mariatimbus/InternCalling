# Expanded Profile / Resume hub: frontend subtask and backend handoff

Status: frontend structure implemented locally; collection contracts and integration pending.
Branch: feature/bianca-profile-resume-hub. Original complete application; no commit/push.

## Implemented versus pending

- Completion is now a compact "Profile completion: X%" label and labelled native progress. The existing pure eight-item formula, validity checks, confirmed-update callbacks, unavailable/retry handling and refresh race protection are unchanged. No visible checklist, formula or matching explanation remains in this component.
- Existing saved profile/editor, Skills and Resume links remain functional with their existing authenticated APIs, Save/Cancel/error behavior and persistence. The sidebar/opportunities/workspace remain intact.
- Six reusable, responsive, labelled cards show "This section is not connected yet". This means unknown integration state, not an empty fetched collection. There are no samples, Add/Save controls, localStorage, CRUD requests or fake persistence.
- UI section identifiers/types are not backend resource schemas. New collection fields below are proposals only.
- Upload, parsing, user confirmation, tailored CVs and collection CRUD are not implemented. Current onboarding/auth guards, matching, completion calculation and Resume link fallback remain unchanged.
- This document supersedes the old completion-card UI description in B4-profile-completion.md; its historical test results are not new verification.

## Provisional collection fields (not confirmed API contracts)

Each proposal includes a server-generated stable id, owner association, ordering and version/timestamps as described below. No endpoint routes have been agreed.

| Section | Proposed content fields |
| --- | --- |
| Experience | role_title, organization, location, employment_type (optional agreed enum), start_date, end_date, is_current, description |
| Projects | name, summary, role, technologies (agreed representation), project_url, repository_url, start_date, end_date |
| Certificates | name, issuer, credential_id (optional), credential_url, issued_date, expires_date, does_not_expire |
| Honours & Awards | title, issuer, awarded_date, description, reference_url |
| Languages | name, proficiency (optional agreed enum, not inferred), certification (optional) |
| Publications | title, authors (ordered structured list), venue, publication_date, doi, publication_url, description |

Fields, requiredness, limits, enum values and date representation require Maria/Dalia agreement. This table is not a migration or finalized frontend DTO. Profile language proficiency must not be confused with programming skills.

## Required authenticated backend capabilities

For each collection: owner-scoped read/list, create, partial update, delete and persisted ordering. Decide individual versus transactional reorder before implementation; return canonical persisted records and stable IDs. Return an authenticated known-empty collection distinctly from unavailable/not-integrated data. Confirm pagination or bounded collection limits.

Derive ownership from verified Supabase identity, never an editable user_id. Enforce ownership in APIs and RLS, with USING and WITH CHECK where applicable. A user must not read/change another user's IDs, reorder their rows, or assign another owner. Define cascade/retention behavior on account deletion. Require Maria review of API/security and Dalia review of reproducible migrations and policies.

Proposed common fields: id, owner_user_id, position, created_at, updated_at and revision. Names are provisional. IDs must survive edits, reordering and subsequent parser runs. Resolve simultaneous manual/parsing edits with explicit version conflicts rather than silently overwriting.

Support nullable and partial dates without invented January/first-day defaults: agree a structured year/month/day plus precision representation (or equivalent). End date unknown, current position and explicitly absent date must remain distinguishable. Validate real dates and compatible ranges/precision; do not require exact dates that the user does not know. Agree how approximate comparisons work.

Agree required/nonblank text, trimmed lengths, row-count limits, null versus omitted PATCH values, enums and safe URL validation (absolute HTTP/HTTPS, no embedded credentials). Treat user text as plain text unless a reviewed rich-text format exists. Validate author ordering and duplicate handling. Do not infer qualifications or proficiency.

Use stable machine-readable error codes with safe messages and field errors: authentication, forbidden/not-found policy, validation, conflict, throttling and unavailable service. Never leak another user's record existence or raw provider/database errors. Confirm write success only after persistence; preserve user drafts on failure and offer retry. Define idempotency/retry semantics for creates and deletes to prevent duplicates after timeouts.

## Future upload-first onboarding dependencies

Product direction: private PDF upload -> structural validation/storage -> asynchronous extraction -> draft review/correction -> explicit user confirmation -> persisted profile/collections. This direction is not active in current onboarding.

Prerequisites requiring backend/storage review:
1. Confirm project, private bucket, per-user Storage policies, metadata, server byte/type/size validation, authorized short-lived downloads, replace/delete lifecycle and orphan cleanup.
2. Define parsing job IDs/status/errors, extraction provenance/confidence and original document retention. Extracted content is untrusted draft data, not authoritative user facts.
3. Define a versioned draft and explicit confirmation operation with transactional/partial-failure semantics across profile/collections; safe retry must not create duplicate entries.
4. Confirm readiness/guard rules and migration for existing users, link-only resumes, skipped/unavailable parsing, and manual entry. Do not change current guards until agreed and integrated.
5. Manual editing after parsing must remain fully supported. Preserve user corrections across later parses; show conflicts and require confirmation instead of overwriting. Keep explicit null clearing and stable IDs.
6. Define whether collections ever participate in matching separately; this frontend subtask makes no such claim. Completion remains the existing eight items until explicitly redesigned.

Keep the existing Resume link feature until an approved migration/fallback plan exists. No upload service, parser secret, schema or hosted setting is introduced here.

## Verification and manual checklist

Automated command uses all existing auth/B4 Node tests, including matching-refresh.test.mjs and the updated profile-completion.test.mjs. Tests cover compact progress/unavailable state, unchanged persisted update/Cancel behavior, six labelled neutral cards without controls, and preservation of editor/Skills/Resume children. Actual results: 68 Node tests passed; npm run lint, npm run typecheck and npm run build (Next.js 16.4.5) passed; git diff --check and new-file whitespace checks passed. Controlled render tests are not live-service or browser visual verification.

Pending manual checks:
- Sign in and open Profile on desktop and narrow mobile. Check compact completion, section wrapping, headings and keyboard focus.
- Save/Cancel a profile edit; add/remove a skill; add/replace/remove a Resume link. Confirm persistence after reload and completion updates only from the original eight items.
- Simulate selected-skills/profile read failure: no false percentage; retry works.
- Verify all six cards say unconnected, never imply fetched-empty or saved data, and expose no fake editing controls.
- Verify sidebar/Jobs navigation, authentication and current onboarding remain intact.

No real-service checks are marked passed by this document.
