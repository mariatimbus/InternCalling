# Resume parsing review frontend handoff

Original complete application, feature/bianca-profile-resume-hub. Frontend only. No parsing, OCR, AI calls, real confirmation/persistence, database/Storage, authentication or onboarding changes. All new service/data contracts below are proposed; no live routes are agreed.

## Implemented and production boundary

ResumeReviewFlow provides processing/status, editable review, a separate selected-change summary, explicit confirmation, and a confirmed receipt/snapshot or actionable error. It takes ResumeReviewService and an authorized ResumeIdentity. Real Profile does not import this flow or its synthetic service; its PDF section only adds an unavailable parsing notice. Existing manual profile/skills/collection editing, resume link/PDF frontend, completion, Jobs and auth remain intact.

Basic profile covers headline, bio, degree_level, university, field_of_study, graduation_year and location using existing draft fields/validation. Existing/proposed values appear together. Fields start skipped. Missing/null/blank extraction values do not erase saved data. Explicitly checking a blank allows intentional clearing, shown in the confirmation summary. Edited but unchecked values are not submitted.

Skills reuse normalization, validation and grouped category/alias discovery with draft-only callbacks. Selected names are additive and deduplicated against saved names. No saved skill removals or live addProfileSkill calls occur during review. Alias discovery does not introduce alias-aware matching or rename saved records. Use the existing manual Skills section for removal.

All six collections are covered: Experience, Projects, Certificates, Honours & Awards, Languages, Publications. Each proposal starts skipped. Choosing Add or Update selects present proposed fields; fields remain individually editable/checkable. Update requires an exact saved record ID/revision behind the user's selection. Titles are never matched automatically. Missing/unchecked fields remain out of updates. Two proposals cannot silently merge into the same saved entry. Add creates a separate entry; no collection deletion is supported.

Existing collection draft types, controls and validators are reused. Dates preserve YYYY or YYYY-MM and unknown blanks. Required missing titles/organizations need correction or skipping. Review deliberately permits unknown Experience start/end dates by filtering missing-date errors; the existing manual Experience form still requires dates and is unchanged. Maria/Dalia must agree nullable Experience dates before integration. Other range, current/ongoing, non-expiring, Native/CEFR, URL, DOI and author-order rules remain validated. Changing Native/Ongoing cannot silently clear an existing CEFR/end date: the reviewer must explicitly select its clearing too. Missing fields are omitted from changes; confirmed collection snapshots keep unextracted fields null, including booleans and dates. Existing form defaults are used only as validation placeholders and are never persisted as extracted facts.

Warnings are supplied strings at result/proposal level, rendered as text. No confidence score or facts are invented. Inputs and snapshot rendering never use HTML injection. Collapsible sections, labelled native controls, associated errors, status announcements and rounded dark tokens are used. Validation opens its section before focusing the invalid field. Phase changes focus the heading. Browser/mobile checks remain pending.

## Proposed models and service

Source is ResumeIdentity { id, revision }: an authorized private resume record, not resume_url or a signed URL. The backend must authorize/current-version-check it; a client ID alone proves nothing.

ParsingJob: { id, source, profileRevision, status: queued | processing | ready | failed, message? }. Provenance stays fixed for a job. The UI checks job ID, source and profile revision across status/result responses. Processing is indeterminate; after ten delayed polls the user can Check processing status again or Cancel. Agree adapter timeouts/long-running job recovery.

ParsingResult:
- jobId, source.
- snapshot: { profileRevision, profile, skills, collections }, the coherent authenticated saved baseline at that version. All collection reads must be known; unknown reads must not become empty arrays.
- proposed.profile: partial editable field-to-string/null map.
- proposed.skills: names, not automatically saved associations.
- proposed.collections: { key, section, values, warnings } candidates. values contains partial existing-section draft fields; null means not extracted. key is a proposal ID, never a fuzzy-matched saved ID.
- warnings: supplied strings. Warning codes/field paths can be agreed later; confidence is not required.

ReviewSnapshot uses normalized UI ProfileDraft strings, saved skill names and per-section { id, revision, position, values } records. Each collection draft field can be null to preserve unknown facts, including native/current/ongoing/non-expiring flags; null is distinct from an explicit false. Values reuse existing UI drafts, including newline text for Experience achievements/Publication authors and arrays for Project technologies. The future adapter must map actual backend records while preserving IDs, associations, ordering and unknowns. This is not the confirmed backend schema. Basic profile changes use existing ProfilePatch types, including nullable fields/numeric graduation year.

ReviewChanges:
- requestId: immutable idempotency identity for this exact payload.
- jobId, source, profileRevision: expected provenance/concurrency.
- profile: only explicitly selected changed fields/null clearing.
- skills: { add: normalized names[] }, without removals.
- collections: { section, proposalKey, operation: add | update, target?: { id, revision }, fields: partial chosen fields }. Add has no target; update has an explicit target/version. Agree deliberate blank-to-null mapping; missing fields are omitted.

Service signatures (no endpoint routes are agreed):

```ts
start(source, { signal }): Promise<ParsingJob>
status(jobId, { signal }): Promise<ParsingJob>
result(jobId, { signal }): Promise<unknown>
confirm(changes, { signal }): Promise<ReviewReceipt>
```

ReviewReceipt is { requestId, jobId, source, snapshot }. Validate provenance/identity, complete snapshot and changed profile revision before displaying success. onConfirmed(receipt) is the future integration hook to reload/revalidate Profile and Jobs. Callback failure must not relabel a confirmed transaction as a failed save. Real-service cache integration is pending; manual editors remain available afterward.

## Maria/Dalia backend dependencies

Implement owner-authorized resume identification and job creation/status/result/confirmation. Do not fetch arbitrary resume_url links or treat temporary URLs as object identity. Agree job creation idempotency, result retention/expiry, authorized reads and safe missing/failed states. Parser/OCR/AI implementation remains outside this frontend task. Return structured unknowns/partial dates/warnings without fabricated data.

Freeze a coherent saved baseline and stable IDs/revisions/order. Agree whether profileRevision is a whole-hub ETag or version vector; it must detect relevant manual changes across all covered data. Compare current resume and each updated record version too. Do not resolve ambiguity by similar titles. Never infer account-holder authorship, Native=C2, unknown expiration=non-expiring, or DOI/reference=verification.

Revalidate all explicit changes against owner data. Whitelist fields and validate required/optional text, URLs, DOI, dates, flags/enums, ordered authors, skills and language uniqueness. Validate merged updates but apply only selected fields. Preserve unrelated data/IDs/associations. Resolve skill names using existing normalized records without alias-aware matching/destructive renaming. Agree null/absent semantics, nullable dates/flags, limits and canonical response/error fields before connecting.

Where records share PostgreSQL, commit selected profile, skill/collection associations, revisions and the idempotency receipt in one transaction. Roll back all changes on failure. Do not disguise partial success as a full receipt. External parser/storage work needs its own durable recovery state. Preview copy-then-assign memory atomicity is not database evidence.

Require verified Supabase identity, API ownership checks, appropriate RLS and cross-user denial tests. Derive ownership server-side. No new frontend secrets/service-role credentials. Define stable IDs/order and account deletion. Manual editing after parsing must stay supported; confirmation must not overwrite later corrections.

## Errors, retry and cancellation

Map stale source/profile/entry versions to ResumeReviewConflict. Retain the draft, block confirmation and require explicit discard/reload; no automatic merge. A changed resume additionally requires the parent to load its latest authorized identity. The preview has Use latest synthetic resume for that recovery.

Map definite pre-commit errors to ResumeReviewRejected; preserve selection for correction or same-payload retry. Other failures/malformed receipts are uncertain: preserve requestId/payload, disable editing and retry that exact confirmation. Backend idempotency must replay an already committed receipt and reject the same key with different data. Client pending guards alone do not guarantee idempotency.

Cancel processing aborts local waiting/ignores late results; it does not claim the server job stopped/deleted. Cancel review discards only local proposals, never saved data/resume. Cancellation is disabled during confirmation because abort is not rollback. Unmount ignores late UI responses. Cancelling an uncertain confirmation warns the server may already have accepted it and Profile must be reloaded. Agree reconciliation, timeouts, auth expiry, rate-limit/validation errors and safe error field paths. Never expose/log raw credentials, documents or private URLs.

## Integration and exact preview instructions

- src/lib/resume-review.ts: types, runtime guards, pure draft/change-set validation.
- src/lib/resume-review-controller.ts: processing/review/confirmation lifecycle.
- src/components/profile/resume-review-flow.tsx: reusable service/source/onConfirmed UI.
- src/lib/resume-review-preview-service.ts and components/dev/resume-review-preview.tsx: isolated synthetic fixtures/memory confirmation.
- app/dev/resume-review/page.tsx: development-only route.
- Existing resume-pdf-section.tsx: unavailable parsing notice only; no auth/onboarding or production simulated integration.

From apps/web run `npm run dev`, then open http://localhost:3000/dev/resume-review (use the actual dev port if different). Clearly labelled hand-authored synthetic fixtures, not extracted from a user's PDF. No real profile/skills endpoints. Reload clears jobs, snapshots, receipts and revisions. No localStorage/IndexedDB or production samples. Non-development calls notFound() before rendering; route is noindex.

Manual browser checklist (pending):
1. Start review: inspect processing, supplied warnings, existing/proposed values and all sections. Missing Bio/University stay skipped. Editing alone must not save.
2. Correct/apply Headline, skip Bio, add a draft skill through category discovery. Select exact saved entries for Update; the two Developer entries must not auto-match. Add creates separate entries. Clear fields only deliberately.
3. Review selected changes, Back to review, edit/skip, then Confirm. Inspect the confirmed memory snapshot. Open Profile for manual editing goes to the existing real authenticated page; fixtures are not transferred there.
4. Arm processing/result/missing/invalid failures before starting. Arm save failure before Confirm and retry/correct. Arm lost confirmation response; Retry exact confirmation must not duplicate additions.
5. Change profile/resume revision while reviewing, then Confirm: conflict/no overwrite. Profile conflict: Discard draft and reload review. Resume conflict: Use latest synthetic resume, then start again.
6. Cancel during processing/review, navigate away while pending and refresh: no late revival. Confirmation cannot be cancelled in flight. Verify keyboard/focus, collapsed-section errors, narrow mobile/high zoom, long/HTML-like text as text.
7. Real Profile keeps parsing unavailable while existing manual functionality works. Production /dev/resume-review must be 404.

## Verification

Focused controlled-fixture tests cover guards, review/edit/skip, missing preservation/clearing, all sections/exact targets, dates/authors/skills, Cancel/late results, failures, stale versions, atomic preview rollback, lost-response idempotency, duplicate confirmation prevention, unmount and preview gating. No shared backend/Storage/user data. Final command results will be recorded after execution. Browser/mobile and real-service parsing/confirmation/authorization checks remain pending.

Actual automated results: `node --test tests/*.test.mjs` passed all 174 auth/B4 tests, including 20 resume-review tests. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Scoped whitespace/conflict checks also covered new/untracked files. The transient Windows helper Access denied failure recovered through the normal execution path without toolchain/trust changes; final checks ran successfully afterward. Preview production gating is tested at the route function, not deployed HTTP. Browser/mobile/keyboard and real-service parsing/confirmation checks remain pending.
