# Resume PDF upload frontend handoff

Original complete application on feature/bianca-profile-resume-hub. Frontend and simulated development service only. No live routes, bucket, storage policies, database schema or deployment settings are agreed or configured by this subtask.

## What works now

Real Profile uses ResumePdfSection as its primary Resume experience. The native labelled file input selects one PDF for preliminary filename/MIME/size checks. It displays the local filename/size, permits a different choice or cancellation, and explicitly disables upload without a connected service. It never calls storage, shows uploaded metadata or invents progress/success in that mode. Browser picker cancellation preserves the previous selection; invalid reselection clears only the local draft, never confirmed metadata. Drag-and-drop is not implemented; the native keyboard-accessible file picker is the supported path.

Use a link instead wraps the unchanged real ResumeEditor and its existing authenticated PATCH resume_url workflow. It starts expanded when a saved link exists. PDF identity and link state are independent: selecting/uploading/deleting a PDF never writes/clears resume_url, and link changes do not imply a PDF upload. The eight-item Profile Completion formula remains unchanged. There is no parsing, malware scanning, analysis, tailoring or matching effect.

With an injected service, the section supports authoritative metadata loading/unknown/retry/empty states, pending upload and actual byte progress, access links, replacement, deletion confirmation, conflicts and actionable failures. The selected local File and confirmed ResumeMetadata are independent. Previous confirmed metadata remains during replacement; only a confirmed response or authoritative reconciliation changes it. Failed writes retain the selected file for retry. A failed metadata refresh shows last-confirmed data as potentially stale and disables writes/access until Retry succeeds.

## Files and integration points

- src/lib/resume-pdf.ts: proposed types, client selection rules, confirmed metadata/access guards and formatting.
- src/lib/resume-pdf-controller.ts: async operation lifetime, pending guards, cancellation/reconciliation, progress and access cleanup.
- src/components/profile/resume-pdf-section.tsx: reusable UI; service and preview props, with optional children rendered under Use a link instead.
- src/components/profile/profile-hub.tsx: real Profile renders ResumePdfSection without a service, with the unchanged ResumeEditor as children. Connect a future authenticated adapter here after backend review. Never connect the preview adapter here.
- src/lib/resume-pdf-preview-service.ts, components/dev/resume-upload-preview.tsx and app/dev/resume-upload/page.tsx: isolated simulated preview.
- tests/resume-upload.test.mjs: controlled service/component fixtures; existing Resume link and Profile Completion tests provide regressions.

The component creates/disposes a controller per effect lifetime, supporting Strict Mode remounts and service changes. Unmount unsubscribes, aborts the active operation and releases current/late local preview URLs. Inputs/actions use existing rounded dark semantic tokens, visible focus, accessible labels/hints/status/alerts, an indeterminate/determinate native progress element and wrapping layout. Cancel selection restores file-input focus, deletion focuses Keep PDF, access completion focuses the safe link, and completed/cancelled operations restore heading focus. Manual browser/mobile checks remain pending.

## Proposed metadata and service (NOT agreed live API)

ResumeMetadata:
- id: stable application-owned resume record identifier; not a public URL or Storage object path.
- revision: positive integer concurrency version.
- fileName: original display filename (plain text, not trusted as a safe filesystem/storage name).
- sizeBytes: confirmed file size.
- contentType: confirmed application/pdf.
- uploadedAt: confirmed ISO timestamp.

ResumeIdentity is { id, revision }. The backend additionally needs verified owner, private object identity/key/bucket, integrity/validation status, retention/cleanup information and concurrency metadata; do not overload resume_url with any of these. Object paths must be generated safely server-side, not derived directly from the original filename. The UI only displays confirmed ready metadata, not pending/quarantined objects.

ResumePdfService signatures:

```ts
load({ signal }): Promise<ResumeMetadata | null>
upload(file, { replace: ResumeIdentity | null, signal, onProgress }): Promise<ResumeMetadata>
access(identity, { intent: "view" | "download", signal }): Promise<ResumeAccess>
remove(identity, { signal }): Promise<void>
```

replace=null means first upload; a replacement supplies the current id/revision. The backend/adapter must reject stale replacement/removal and concurrent first-upload races. Agree whether replacement preserves the resume record ID with a new revision or returns a new record ID; the UI uses the canonical returned identity. No live route names are agreed or called.

onProgress receives { transferredBytes, totalBytes } for actual transferred bytes only. It is optional to report progress at all. Invalid metrics return the UI to indeterminate; percentages are floored and 100% transferred still waits for confirmed metadata. Do not derive percentages from time, file reads or arbitrary milestones. The preview does not transfer bytes and never calls onProgress; it intentionally remains indeterminate. The determinate UI is covered with controlled service reports in tests, not claimed as a real-service/manual transfer.

ResumeAccess is either:
- { kind: "authorized", url, expiresAt }: short-lived absolute HTTPS access URL issued only after owner authorization. No embedded credentials or ambiguous/control characters. UI expires it and requests another as needed. No signed URL is persisted/logged/documented.
- { kind: "local-preview", url, release() }: blob URL accepted only in explicitly flagged development preview mode. release must be idempotent. Never represent this as a persisted object, signed URL or real upload.

The UI first requests View PDF/Download PDF, then offers a focused safe Open/Download ready PDF link. This avoids async popup blockers. Authorized download behavior/Content-Disposition must be enforced by the backend/storage response; cross-origin download cannot rely on HTML download alone. Preview downloads use a local blob and the download attribute.

## Proposed states/errors

Controller status: unconnected/loading/ready/unavailable. busy: null/upload/cancelling/remove/access. Keep confirmed metadata separate from local selection, progress, notices, errors and access handles. A null result from successful load means no saved PDF; a failed/malformed load means unknown, not empty.

Map version/ownership-visible concurrency failures to ResumePdfConflict. Agree structured safe errors for unauthenticated/forbidden/not-found, validation/too-large/unsupported PDF, rate limiting, unavailable service, expired access and version conflict. Never return secrets or raw storage/connection errors. Current UI gives safe generic messages, retains selected/confirmed state and re-reads authoritative metadata after uncertain upload/delete outcomes. An adapter must reject malformed/unconfirmed responses rather than resolve as success.

## Maria/Dalia: server and storage prerequisites

Confirm the final 5 MiB (5,242,880 byte) limit and enforce it at request/stream/storage boundaries before accepting oversized data. Browser checks are convenience only: exactly one non-empty file, .pdf extension and <=5 MiB. Explicit non-PDF MIME conflicts are rejected; missing/application/octet-stream MIME is allowed with a warning. No client magic-byte/parser check or malware safety guarantee is made.

Server validation must independently inspect bytes/signature and PDF structure with a reviewed PDF validator, enforce MIME/content rules and resource limits, and reject unsupported/encrypted/corrupt files according to an agreed policy. Extension, browser MIME and a %PDF signature alone are insufficient against malformed/polyglot/active-content PDFs. Decide quarantine, malware scanning and active-content handling; scanning cannot guarantee safety. Keep upload separate from parsing/AI.

Provide private Storage and owner-scoped metadata with authenticated Supabase identity, API ownership checks, appropriate RLS/object policies and cross-user tests. No bucket/policy is assumed to exist. Agree reproducible schema/policy migrations and deployment setup. Derive owner server-side; never trust client owner IDs or use a service-role credential in browser code. Any privileged server credentials needed by the reviewed architecture remain server-only, never in this frontend. Existing browser-safe Supabase configuration and authenticated API architecture should be reused; no new environment variables/settings are added here.

Access must authorize current identity each time before issuing a short-lived URL for that specific private object/intent; never store signed URLs in profile fields. Confirm trusted storage origins, URL TTL, secure response headers, original filename sanitization and download disposition. Signed URLs are temporary bearer capabilities, so do not log/expose them beyond the authorized user. Removing a UI link cannot revoke an already issued bearer URL; TTL/storage lifecycle policy must address that limitation.

## Replacement, cancellation, deletion and cleanup

Replacement must upload/validate a new private object first, then atomically compare revision and switch metadata. Keep the prior object/metadata available until confirmation. Failed replacement must not delete the previous file. If the metadata switch fails, clean the unreferenced new object. Delete must owner-authorize/version-check, resolve only after an agreed authoritative deletion state, and reconcile storage/metadata failures without claiming success early. Establish retryable orphan cleanup, retention, account deletion and access-URL expiry behavior. A database transaction cannot atomically roll back remote Storage writes; specify a reviewed compensation/retry strategy.

AbortSignal is a request to stop, not proof of rollback. The controller enters cancelling, ignores further progress, blocks new writes until the submitted promise settles, then reloads metadata. A late upload response is never directly adopted as upload success after cancellation; authoritative load may show a completed upload if the server committed before stopping. Copy says Request stopped/current status, not that a committed upload was rolled back. Reconciliation failure retains last-confirmed metadata as stale and requires Retry before mutations.

The future adapter/backend must define operation IDs/idempotency and cancellation/reconciliation guarantees. In particular, an immediate client AbortError followed by a read does not prove that the server cannot commit later. Adapter settlement/reload must reconcile the server operation (or return an explicit unknown/in-progress state) before allowing another write. Use timeouts and safe retry/status recovery; do not weaken this by treating fetch abort as transaction rollback. Unmount prevents UI updates but cannot guarantee cancellation of a committed server operation. Define ambiguous response, conflicting update and delete-not-found behavior before connecting.

## Preview and manual checklist

From apps/web run npm run dev and open http://localhost:3000/dev/resume-upload (use the actual development port if different). Production/non-development invokes notFound() before rendering; route is noindex. The preview is visibly labelled simulated and memory-only. No file is sent to a server, no private bucket is used, and reload creates an empty service. No localStorage/IndexedDB or production samples are used.

Preview controls arm one failure for upload/replacement, remove, load or access, plus a revision conflict for the next upload/removal. Requests have a cancellable delay so pending/stop states can be exercised. It stores File/metadata in memory only. Object URLs are created only on requested access after simulated confirmation, never on selection. Access handles are released when replaced, refreshed, expired/abandoned or unmounted, including late access responses. The adapter exposes dispose for direct fixture callers; the UI controller owns and releases every access handle it requests. URLs are never treated as persistent/signed URLs. Blob-backed viewer behavior depends on the browser; no PDF contents are parsed/analyzed here.

Manual checks (pending):
1. Real Profile: select a PDF, see name/size; choose another or Cancel selection. Upload stays unavailable and nothing is labelled uploaded. Open Use a link instead; verify existing add/replace/remove link behavior and saved links after refresh.
2. Reject empty/oversized/non-PDF and multiple-file attempts. Test uppercase .PDF and unknown MIME warning. Confirm the notice does not claim server/malware validation.
3. Preview: upload, view/download via the generated local preview link, replace, confirm removal. Pending is indeterminate. Confirm old metadata remains until replacement succeeds.
4. Arm upload/replacement failure; previous resume remains and selected file can retry. Arm remove failure; confirmed resume stays. Test access/load failures and Retry status, and conflicts before upload/remove.
5. Cancel an upload/replacement, then wait for reconciliation before another attempt. Navigate away/reload during pending/access: no late UI update, temporary entries reset, and local URLs are cleaned up. Production preview URL must be 404.
6. Keyboard/desktop/mobile/high zoom: labels, file picker, long filenames, wrapping, progress/status/error announcements, Cancel, safe-link focus and Keep/Confirm deletion. Recheck complete Profile, Skills, collections, auth and Jobs. Do not mark real Storage/upload checks passed until a reviewed backend exists.

## Verification

Tests use controlled service/component fixtures and an isolated memory adapter. Coverage includes selection/limit/MIME rules, unknown versus empty metadata, byte-progress rendering, cancellation/abort/late responses, reconciliation failure, retry, replacement retention, delete failures/pending guards, safe access expiry, object URL release, unmount, unchanged real link fallback and production preview gating. No shared data or hosted Storage is used for tests. Browser/mobile and actual upload/ownership/storage checks remain pending. Automated results are recorded after execution.

Actual automated results: `node --test tests/*.test.mjs` passed all 154 auth/B4 tests, including 18 PDF upload tests. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Scoped whitespace/conflict checks also covered new/untracked files. Existing Resume link tests and the unchanged eight-item completion regressions passed. Production preview gating is tested through the route function, not deployed HTTP. Browser/mobile/keyboard and real-service upload/storage/access checks remain pending.
