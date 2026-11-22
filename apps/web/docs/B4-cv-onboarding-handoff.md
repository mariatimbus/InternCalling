# CV-first onboarding frontend handoff

Original complete worktree, feature/bianca-profile-resume-hub. Frontend preparation only. No backend/database/Storage, auth callbacks, session behavior, workspace guard, dependency, environment or hosted-setting changes.

## Ready frontend versus real capabilities

The real /onboarding route now opens a focused introduction with Upload your CV as the intended primary path and Complete manually instead as an accessible alternative. CV selection uses the existing ResumePdfSection and its preliminary one-file/non-empty/PDF filename/MIME/5 MiB checks. Upload/parsing are explicitly unavailable: no PDF service is injected on the real page, no file is uploaded/analyzed, and reviewing cannot proceed from a local selection. Manual completion stays reachable from the introduction, PDF step and review composition.

The real manual OnboardingFlow and finishOnboarding action remain the working path. Server reads, verified session ownership, failed-skill-read handling, completed-account redirect and edit=1 behavior are preserved. finishOnboarding still validates, writes existing skill/profile endpoints, verifies the persisted response and redirects to /jobs. Real manual completion therefore keeps its existing verified redirect rather than a new client-only completion flag. Existing Profile editors remain available after onboarding. No guard is relaxed.

The reusable CvOnboardingFlow composes introduction, PDF selection/upload, processing/review, missing-required-detail correction, selected-change confirmation and a confirmed completion screen when services are available. ResumePdfSection and ResumeReviewFlow are reused; no upload, parser, skill mutation or confirmation logic is reimplemented in the UI. Optional observations/selection locking/onboarding validation preserve their default Profile behavior.

## Existing completion rules

Reuse validateOnboarding and isProfileComplete exactly:
- degree_level: bachelor or master.
- university, field_of_study, location: non-empty trimmed strings, maximum 255.
- graduation_year: a whole year from 1900 to 2100.
- skills: optional, with existing count/name validation.

Headline, bio, resume, skills and all six optional collections are not extra completion requirements. The eight-item Profile Completion card formula is unchanged and separate from onboarding eligibility. isProfileComplete's input type now describes only the five properties it already reads; runtime rules are unchanged.

CV review marks those five fields required, shows existing/proposed values and requires applying/correcting them before confirmation. The review controller gets an optional pre-confirm validation hook; ordinary Profile review remains unchanged. Missing extraction does not erase saved values. The user must explicitly accept or enter required values. The service adapter must independently enforce the same completion condition, and the parent checks the authoritative returned snapshot again before showing completion/navigation.

No completion is inferred from file selection, upload metadata, local drafts, a ready parser job or a clicked button. The preview completion screen is explicitly a demonstration and cannot grant workspace access. A future real onContinue handler must refresh/revalidate saved data and use existing server-guarded navigation; do not create client storage/cookie completion flags.

## Proposed service and capability contracts (not agreed routes)

CvOnboardingServices composes:
- capabilities: { upload, parsing, confirmation }, each boolean. Enable the CV path only when all three are connected and authorized. Determine these before starting a session and keep injected services stable while drafts are active. A missing capability must preserve manual completion, not upload into a dead end.
- pdf: existing ResumePdfService, with private metadata identities/revisions, cancellation/reconciliation, safe access and replacement semantics from B4-resume-upload-handoff.md.
- review: existing ResumeReviewService/ParsingJob/ParsingResult/ReviewChanges/ReviewReceipt from B4-resume-review-handoff.md, plus the onboarding-required-details validation boundary.
- manual: an injectable load/confirm adapter used by the isolated preview. load({signal}) returns a current ReviewSnapshot; confirm(draft,{profileRevision,requestId,signal}) returns an authoritative complete snapshot. This is a frontend abstraction, not a new agreed endpoint. Production can keep the existing real manual React slot/action and does not need a new manual route for this subtask.

The real page supplies its existing manual component as a slot and supplies no CV services. OnboardingFlow defaults to the same real action; its optional submitAction injection is used only by the memory preview. The wrapper forwards pending status and prevents Back/Cancel from hiding an accepted manual save. No production mock is selected by an environment fallback.

## Identity, processing, confirmation and completion

After confirmed upload, pass only the current ResumeIdentity { id, revision } to processing, never a filename, selected File, resume_url or signed URL as proof of identity. Maria/Dalia must authorize the private object and current revision. Bind every job/result to that source and a coherent profile snapshot revision. Supplied warnings remain text; no fake confidence/progress. Preview results are hand-authored demonstration fixtures independent of PDF contents, not real extraction.

Keep selected local files, confirmed uploaded metadata, parser results and editable proposals separate. A selected replacement cannot proceed to review until upload succeeds. Existing proposals are locked against file changes; choosing another CV requires explicit draft-discard confirmation. Replacement/removal or any unexpected source identity/selection change invalidates old proposals. The backend must also reject old source revisions; client invalidation alone is insufficient.

Confirmation uses the existing explicit ReviewChanges partial-field/add-update choices and immutable request ID. Required details are checked against the effective selected profile, not only extracted fields. Preserve missing/unselected data, existing IDs/associations and nullable/partial dates; optional sections can all be skipped. Confirm source/profile/entry revisions and ownership again before writes. For records in PostgreSQL, commit selected changes, revisions and the idempotency receipt atomically. Backend validation is required even if the UI passed.

Replay the same receipt for retries of a committed request, reject reused keys with different payloads, and distinguish definite pre-commit rejection from uncertain/lost responses. Pending guards block duplicate confirmation and navigation. Unknown responses retain the exact request; Back within review cannot generate a new confirmation until retry/reconciliation. Root discard additionally warns that an uncertain confirmation may already have been accepted. Conflicts retain the draft until explicit reload/discard, never fuzzy-match or silently overwrite entries.

Completion requires a valid authoritative snapshot that still satisfies existing rules. Manual editing after confirmed import must remain supported. Future Profile/Jobs cache refresh should happen after confirmation using the existing review onConfirmed integration hook; it is not wired to simulated account writes here.

## Back, Cancel and failure behavior

Back hides panels without unmounting their manual/review drafts; returning resumes the same component/controller/request identity. PDF changes are locked while a review is kept. Keep editing/Escape on the discard prompt preserves it. Explicit discard increments the local session key, aborts/ignores old processing responses and reloads metadata before using another CV. It does not delete already confirmed files or undo persisted profile data. Optional root cancellation resets unsaved manual/selection/review state only.

In-flight PDF requests use their existing Cancel upload and reconciliation behavior; outer navigation waits for them to settle. In-flight CV/manual confirmation cannot be cancelled by hiding it. Processing can continue while its panel is hidden by Back; only an explicit discarded/unmounted review aborts local waiting. No result is automatically confirmed. Stale resume/profile scenarios block writes. Failed uploads keep prior metadata and selected file for retry; processing/save failures retain the appropriate draft. Auth/service failures must be actionable without sending users into an unavailable PDF path.

The existing real manual action uses separate skills PUT then profile PATCH, followed by persisted response validation. That behavior is unchanged; this frontend does not claim those legacy writes are one transaction. Maria/Dalia must decide any future atomic integration and recovery requirements without weakening the current manual fallback.

## Frontend integration points

New:
- src/lib/cv-onboarding.ts: capability/manual adapter types, required-field projection/validation and authoritative completion check.
- src/lib/cv-onboarding-controller.ts: navigation, source invalidation, draft discard, pending gates and completion.
- components/onboarding/cv-onboarding-flow.tsx: reusable composition; manual slot, stable service adapters and optional real onContinue.
- components/onboarding/cv-manual-preview.tsx: existing manual form with explicit memory-only submit injection.
- lib/cv-onboarding-preview-service.ts, components/dev/onboarding-preview.tsx and app/dev/onboarding/page.tsx: isolated synthetic preview.

Existing additive changes:
- app/onboarding/page.tsx wraps its existing manual component without changing auth/redirect/read guards.
- onboarding-flow.tsx adds optional action/pending hooks; default server action stays unchanged.
- ResumePdfSection adds state observation, selection locking and configured parsing-help text, with defaults unchanged.
- ResumeReviewFlow adds state observation/required labels, and ResumeReviewController adds an optional pre-confirm validator. Normal Profile review defaults stay unchanged.
- Existing isolated PDF/review preview adapters expose source/snapshot revision composition hooks for the new demo. They remain absent from real onboarding services.

To connect a real CV path, Maria/Dalia must first deliver reviewed private upload/validation/metadata, authorized parsing jobs/results, coherent revisions, explicit transactional confirmation/idempotency and safe error/capability responses. Then provide stable authenticated adapters and authoritative completion navigation. Keep the existing manual slot available throughout rollout. No endpoint names, bucket/policy or deployment credentials are configured by this frontend task.

## Development preview refinement: sample scenarios

A persistent, prominent sticky notice remains outside the product flow across upload, simulated processing, review and confirmation: "Demo mode — your PDF is not analyzed. The information below is sample data." The scenario confirmation drawer repeats it. Demo-only processing, manual confirmation and success messages explicitly refer to synthetic samples/demo memory and an unchanged real account; normal real-flow copy remains the default.

The development controls offer two radio-labelled scenarios:
- Complete sample (default): valid fictional values for all seven profile fields, normalized example skills, and fully populated examples of Experience, Projects, Certificates, Honours & Awards, Languages and Publications. All data is independent of selected PDF contents. Links use example.invalid and the sample DOI/credentials/proficiency are not verified. Nothing is selected or saved automatically.
- Incomplete extraction: university, graduation year and location are unknown, alongside optional bio, date/status, reference and proficiency details. Users must supply/apply the missing required answers. Some optional sections have no proposals; their presence in a hypothetical CV is unknown, not established as empty. The saved first-account snapshot's empty collections are a separate known state. Unknown booleans/lists/dates stay null, not false/empty/invented values.

The selector is outside CvOnboardingFlow in development controls. Before interaction, switching starts a new sample directly. Once a flow is visited or a file/proposal exists, switching requests confirmation and identifies the local drafts/file/temporary confirmations that will be discarded. Cancel, Escape or drawer Close preserves the exact active scenario, session, file, corrections and confirmation request identity. Confirm starts a new empty demo session and requires selecting a PDF again.

Switching retires the old service session and remounts the flow with a new key. Old processing results and confirmation responses are rejected/ignored, even if a request was pending; no old proposal can populate the new scenario. Temporary blob URLs are released. Already completed operations affected only the retired memory store, never a real account. Existing child controllers still handle unmount/abort and cleanup. Refresh resets everything.

This refinement introduces no new backend requirements, endpoints or schema. It changes development fixtures, session ownership and opt-in presentation/state observation only. Real onboarding still supplies no PDF/parser services, retains the original manual persistence/default copy, and keeps all completion/guard rules unchanged. Future backend dependencies documented above remain pending. New files: cv-onboarding-scenarios.ts (fixtures) and cv-onboarding-demo-session.ts (preview session). These are imported only by preview services/controls and tests, not real onboarding.

## Exact development preview instructions

From the original repository:

```powershell
Set-Location -LiteralPath 'C:\Users\nan77\OneDrive\Desktop\OPPORTUNITY TRACKER\InternCalling-B3\apps\web'
npm run dev
```

Open http://localhost:3000/dev/onboarding using the port printed by Next.js. Use the existing dev server if it is already running. Production/non-development returns notFound(); route is noindex. No real profile, skills, PDF or parser endpoints are called. State, files, jobs and receipts are in memory and reset on refresh; no localStorage/IndexedDB. Blob access cleanup remains owned by the existing PDF controller.

Manual browser checklist (pending):
1. Real /onboarding on an incomplete test account: introduction, Upload your CV preliminary checks/unavailable notice, then Complete manually instead. Finish the unchanged five required answers, optionally skip Skills, confirm and verify the actual server redirect. Returning complete accounts should still go to Jobs; Profile manual editing remains available.
2. Preview CV path: choose one valid non-empty PDF <=5 MiB, Upload PDF, Review CV information, Start review. Results are synthetic, never read from that PDF. Apply/correct all five required fields; skip optional collections/skills. Review selected changes, Back/edit, confirm; only a complete confirmed snapshot reaches the demonstration completion screen.
3. Choose Incomplete extraction in the development controls. Confirm switching if a draft exists, then select/upload a PDF again. University, graduation year and location are omitted: enter/apply them before confirming. Unknown optional details remain unknown and collections stay optional. No file or sample proposal alone marks completion.
4. Back to CV/introduction and return: corrections remain. Choosing a different CV first prompts for explicit discard. Keep editing preserves proposals; Discard enables selection, and the old source cannot confirm. Cancel a pending upload and wait for reconciliation before retry.
5. Exercise Fail upload, Fail processing, Fail confirmation and Lose confirmation response. Retry must retain drafts/request identity without duplicate additions. Change profile/resume data before confirmation: expect conflict. Discard/reload refreshes the current source and baseline. Fail manual confirmation keeps answers for retry.
6. Try rapid duplicate confirmation and Back/Cancel while saving: only one request; navigation remains blocked. Root discard after uncertain confirmation warns that accepted changes are not undone. Cancel setup draft requires confirmation and retains already confirmed data.
7. Manual preview path: complete five fields with no upload, optionally skip skills, confirm in memory. No real write/redirect or workspace access is granted. Back preserves manual answers; explicit discard resets them.
8. Keyboard/Tab/Enter/Escape, visible focus, status/errors, collapsed-field error focus, long filenames, desktop/mobile/high zoom. Refresh resets the preview. Production /dev/onboarding must be 404. Browser, real-service and cross-user manual verification remain pending.

## Verification

Focused controlled component/service tests cover real/default/manual injection, both paths, five-field rules/optional sections, source identity/replacement, draft-preserving Back, explicit cancellation, upload/processing/save failure/retry, stale revisions, pending/double confirmation, authoritative completion, real route redirects and preview gating. Existing auth/onboarding/B4 regressions also run. No shared user data/backend/Storage is written by these fixtures. Actual final command results are recorded after execution.

Actual automated results: the full `node --test tests/*.test.mjs` suite passed all 193 auth/onboarding/B4 tests, including 19 CV-first tests. After restoring two original manual-form Unicode glyphs affected by Windows default text decoding, all 30 affected CV/auth tests were rerun and passed. `npm run lint`, `npm run typecheck`, the final `npm run build` and `git diff --check` passed. Scoped UTF-8/whitespace/conflict checks covered all 18 touched files, including new/untracked files. Production gating was tested at the route function, not deployed HTTP. Manual browser/mobile, real-account onboarding and future real PDF/parser/confirmation verification remain pending.

Preview refinement verification: `node --test tests/*.test.mjs` passed all 201 auth/onboarding/review/B4 tests, including 8 new demo-specific tests. The 8 focused checks passed again after removing unused test-loader variables. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Scoped UTF-8/whitespace checks covered all 11 files changed for this refinement, including untracked files. Browser/mobile visual/focus checks and deployed HTTP gating remain pending; no real service or account write is claimed. No new backend requirements were introduced.
