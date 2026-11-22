# B4 — job-specific resume tailoring frontend

Status: frontend ready for review; real generation, draft persistence, approval and approved-content PDF delivery are **not connected**. This document proposes service contracts, not agreed endpoint routes.

## What works now

- Jobs keeps its original opportunity/application link, match details, filters and selection behavior. An expandable “Tailor resume for this job” entry explains the unavailable capability and links to Profile. It sends no tailoring requests, submits no applications and changes no application status.
- `ResumeTailoringFlow` accepts a typed `ResumeTailoringService` and job ID. Loading obtains authoritative job, source profile and standard-resume identities/revisions. It handles generation/status, review, editing, accept/reject wording, exclusion, ordering, user-provided additions, saving a separate draft, explicit approval and PDF access.
- Source wording/references appear alongside proposed wording. Job requirements are separate; unsupported requirements remain visible as gaps. Manual additions and corrections are user-provided, not verified. Text is rendered as text, never HTML.
- Pending requests block duplicate operations. A confirmed saved draft revision is required for approval; every pending decision must be resolved and at least one item accepted. Edits immediately revoke local approval/download state and require saving and approving again. Profile Completion, matching, saved Profile and standard resume are unchanged.
- Revision conflicts keep local edits, block approval/export and offer a confirmed reload. Definite failures allow retry. An uncertain save/approval/export response locks editing and retries the identical payload/idempotency key to avoid duplicate writes. Cancellation stops local generation/export/download observation; it does not promise server rollback. Late results cannot replace state in a cancelled or retired controller; late local download URLs are released.
- Discard/restart/reload warn before discarding a local draft. Refresh/tab-close uses the browser's before-unload warning while a draft exists. A future host embedding the connected flow must also intercept its own job-switch/client-navigation actions before changing `jobId` or unmounting; the real Jobs entry currently has no editable flow to abandon.

## Development preview

From the repository root, start the existing frontend:

```powershell
Set-Location '.\apps\web'
npm run dev -- --hostname localhost --port 3000
```

Stop the frontend already occupying port 3000 in its own terminal first if necessary. Open `http://localhost:3000/dev/resume-tailoring`. No backend is required for this preview. Production/test mode calls `notFound()`; no demo entry is exposed in real Jobs.

The persistent notice reads: “Demo mode — no AI generation or real account changes. The resume and job below use sample data.” Fictional Lantern Labs/source facts are independent of uploaded PDFs. A campus project is moved ahead of older experience; its proposed wording retains a source reference and the original year-only date. Kubernetes is explicitly missing from the source. The in-memory adapter does not call real profile, skills, upload, generation or application endpoints. Refresh resets all state.

Manual checklist (pending browser verification):

1. Request a draft. Inspect the job/source revisions, missing requirement and original/proposed text. Accept an item, reject another wording to restore source text, exclude an item and move items. Edit text; confirm its decision returns to pending. Add a user-provided item and explicitly accept or exclude it.
2. Save the tailored draft, then approve the exact revision. Prepare the **fixed sample PDF**, request its download link and open it. Its content is fixed and labelled “SAMPLE PDF - NOT YOUR EDITED RESUME”. It is **not** an export of reviewed content. Actual approved-content rendering remains a backend dependency.
3. Edit after approval: approval and the old download must disappear immediately. Save and reapprove before requesting a new sample. Confirm the saved Profile, skills, standard CV and application status remain unchanged.
4. In Development preview controls, arm generation/save/approval/export/download failures before their respective actions. Retry. `save-response` commits to demo memory but loses the reply: editing stays locked until retry reconciles that same saved revision.
5. Change profile/resume/job/draft revision, then save/approve/export/download as appropriate. Confirm a conflict, retained local edits and no download. Reload current data, cancel the discard dialog to keep edits, then confirm it to restart.
6. Cancel generation/export while pending, retry, and navigate away during a request. Retired responses must not reappear. Try rapid repeated buttons. Use Tab, Shift+Tab, Enter and Escape; check the discard dialog restores focus. Check a narrow mobile viewport and high zoom for wrapping and readable source/proposal columns.
7. In real Jobs verify opportunity links/details and mobile drawer still work, tailoring remains unavailable, and Profile/standard resume remain accessible.

The sample PDF is constructed from fixed ASCII PDF objects without new dependencies. Tests check its fixed disclaimer and cross-reference offsets. No PDF parser/renderer was installed, so visual PDF verification remains pending; no claim is made that it renders the edited draft.

## Proposed types and integration points

Defined in `src/lib/resume-tailoring.ts`; orchestration in `resume-tailoring-controller.ts`; UI in `components/profile/resume-tailoring-flow.tsx`. Demo service/fixtures are isolated in `resume-tailoring-preview-service.ts` and imported only by the development preview.

| Operation | Proposed contract / responsibility |
| --- | --- |
| `load(jobId, {signal})` | Authorized `TailoringContext`: job ID/revision/title/organization/safe official URL/requirements; profile and standard-resume IDs/revisions; stable source facts with section, title, text and revisions. Current Jobs data has no revision contract; do not invent one during integration. |
| `generate(scope, {requestId, signal})` / `generationStatus(id, {signal})` | Snapshot-bound asynchronous generation: queued/running/ready/failed, stable generation ID and exact job/profile/resume scope; a validated source-grounded draft on ready. |
| `save(draftRef, blocks, request)` | Compare-and-swap draft revision, persist ordered blocks/decisions and return authoritative content with a new revision. Each block references source IDs/revisions, or is explicitly user-provided with no invented provenance. Never write Profile or standard CV. |
| `approve(draftRef, request)` | Explicit approval of the exact saved revision and scope. No unresolved decisions. Return an approval identity bound to that immutable revision. |
| `exportPdf(approval, request)` / `exportStatus(id, {signal})` | Export ID/status bound to approval and draft revision. Backend verifies current source/job/draft revisions and approval before rendering. |
| `download(exportId, {signal})` | Exact export ID/draft revision, `content: approved-resume`, short-lived authorized HTTPS URL and expiry. Service enforces authorization again; no public bucket or persistent signed URL. Demo alone permits `fixed-sample` local object URLs, revoked on replacement/edit/cancel/unmount. |

All write-like requests include an idempotency key stable for an identical uncertain retry. Servers must scope keys to authenticated owner and operation, reject reused keys with a different payload, preserve receipts across lost responses, and define retention/retry semantics. Return typed definite validation rejection versus revision conflict; network/unknown outcomes must be reconcilable without blindly resubmitting a different mutation. Expose actionable sanitized errors, never credentials or signed URLs in logs.

## Maria/Dalia backend responsibilities

1. Agree on capability/status/error contracts and connect an authenticated adapter. No live routes are invented here. Authorize ownership of every profile, source resume, draft, approval, generation and export. Another user's ID must never grant access.
2. Persist job/source snapshots and revision history, draft identity/order/decisions, manual provenance and source references. Preserve nullable/partial dates and unknown facts. Do not match entries or invent qualifications from job requirements. Reference validation alone does not prove semantic grounding: generation must validate each claim against actual source facts, disclose omissions/warnings and avoid invented achievements, dates, skills or proficiency. No ATS/confidence scores or outcome guarantees are implied.
3. Keep tailoring separate from standard CV/Profile. Manual edits after review remain supported, labelled user-provided. Reject invalid source references, oversized content, stale revisions and unauthorized actions; validate again server-side, including URLs.
4. Make save/approval/export concurrency-safe. Every content, selection or ordering edit creates a new revision and invalidates old approval/export. A stale job/source/draft must produce a conflict, never silently overwrite. Approval must apply to the exact normalized content the user reviewed. If save normalizes content, return it for a renewed review.
5. Render **only accepted blocks, in approved order**, from the immutable approved revision. Export contents must match that revision exactly (including user edits), with a stored content hash/revision binding. Do not render from a mutable latest draft or current Profile. Reject requests with stale/missing approval and protect all PDF access. Configure download disposition/expiry appropriately; no arbitrary URL fetching is added in this frontend.
6. Define generation/export cancellation and retry/reconciliation semantics, failure statuses, orphan cleanup, retention and private temporary download authorization. A local abort is not rollback. Clean abandoned generated artifacts without deleting the user's standard resume.
7. Integration tests must cover two-user access isolation, grounded output, atomic persistence, revision races, idempotent lost-response retries, stale approval/export rejection, PDF contents matching approved text/order/exclusions, and expiring authorized access. Browser tests must exercise the eventual real adapter separately from synthetic previews.

## Verification

Focused Node component/controller tests cover review/edit/accept/reject/reorder, user provenance, malformed references, approval invalidation, revision conflicts, failure/retry and uncertain-save reconciliation, duplicate prevention, cancellation/late results, local URL release, safe application/download links, the persistent notice and production gating. These are isolated controlled tests, not real-service or browser confirmations. Final command results are reported with the implementation; manual desktop/mobile and PDF visual checks remain pending.

Verified on the original worktree for this implementation:

- `node --test tests/*.test.mjs`: **222 passed**, including **21 tailoring tests** and the existing auth/onboarding/profile/skills/resume/collection/matching regressions. The matching regression's controlled component dependency map was extended for the new Jobs entry; its matching assertions remain unchanged.
- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js 16.4.5.
- A temporary production server on loopback port 3188 returned HTTP **404** for `/dev/resume-tailoring`, with no demo notice or fictional job in its response. This verification server was stopped afterward.
- `git diff --check`: passed; new task files also checked separately for trailing whitespace and conflict markers. The generated `next-env.d.ts` import-path changes were removed from the task diff.

No hosted settings, database data, backend, dependencies, environment configuration or real account state were changed. No manual real-service generation/export results are claimed: those capabilities are not connected.
