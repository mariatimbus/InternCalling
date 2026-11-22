# Honours & Awards frontend handoff

Branch: feature/bianca-profile-resume-hub, original complete application. Frontend implemented; backend contracts and endpoint routes remain unconfirmed.

## Implemented and pending

The real Profile hub includes Honours & Awards instead of its generic unconnected card. Users can draft an award, validate required/optional fields, and Cancel or Escape. Validate draft reports only validation, explicitly not persistence; Save remains unavailable without a service. No account awards are fetched, no false empty-data claim or saved entry/success is produced. Drafts are lost on navigation/reload. Existing profile, Skills drawer/mutations, Resume links, completion, Experience, Projects, Certificates, Jobs and authentication are preserved. Awards do not enter the eight-item completion formula or matching.

HonoursSection accepts an optional HonoursService and reuses CollectionService, CollectionView, partialDate, URL safety validation and shared rounded Input/Field/Button controls. It renders typed unconnected/loading/empty/error/ready states; writes show pending, confirmed success, retryable failure or revision conflict. Failed writes retain drafts/confirmed entries. Cancel discards edits. Deletion requires explicit confirmation. A synchronous pending guard prevents duplicate create/update/delete and blocks cancellation while a request is accepted. Forms focus title on opening and the first invalid control on validation failure; confirmations focus Keep entry. Cancel/Escape/success restore focus to the section heading. Native controls, linked field errors, alert/status regions, wrapping actions and semantic dark tokens support keyboard and narrow layouts. Actual browser/mobile verification is pending.

## Development preview

From apps/web run `npm run dev`, then visit http://localhost:3000/dev/honours (use the actual port if different). The visible notice identifies temporary memory data. Starts empty; reload clears all entries. No sample entries, localStorage, real identity or database are used. The route calls notFound() outside development and is noindex.

- Add award, Save, Edit, Cancel, Save another edit, then Delete with Keep entry or Confirm delete.
- Simulate next failure: the next load/create/update/delete rejects once, without changing memory records. Use Reload honours to test a load failure and Retry loading to recover.
- Simulate next edit/delete conflict: the next update/remove rejects once as HonourConflict, preserving data. Load/create do not consume this flag. Cancel editing/deletion, Reload honours, then reopen/retry. This explicitly simulates the error state; stale revision validation also exists independently in the adapter.
- Controls do not imply real backend availability. In-memory success is confined to this labelled development preview.

Manual checklist (pending):
1. Real Profile: Draft award, Validate draft with blank/whitespace title, enter a valid title, validate, then Cancel/Escape. Saving stays unavailable and reopening starts blank.
2. Preview: create with title only; optional organization/date/description/link must be absent rather than invented. Edit with year-only and year/month dates and a multi-line description. Check safe external link/new-tab announcement.
3. Reject full day dates, impossible months, relative links, javascript/data URLs and embedded credentials. Valid HTTP and HTTPS are allowed; no link availability claim is made.
4. Cancel an edit; persisted preview entry is unchanged. Test deletion confirmation/Keep entry/Escape. Rapid double submissions cause one write.
5. Arm failure before create/edit/delete/load. Confirm drafts/entries remain and retry works without false success. Arm edit/delete conflict and follow Cancel/Reload recovery.
6. Verify desktop, mobile and high zoom for wrapping and no overflow, labels, visible focus, Tab/Shift+Tab/Enter/Escape. Refresh clears preview data. Production /dev/honours must be 404. Recheck existing Profile editor, Skills and Resume links.

## Proposed fields: NOT a confirmed backend schema

HonourDraft (camelCase UI/service names):
- title: required trimmed plain text; proposed 1-255 characters.
- organization: optional trimmed plain text; proposed maximum 255.
- receivedDate: optional YYYY or YYYY-MM, proposed year range 1900-2100. Empty/whitespace UI value means unknown/unprovided. Never infer January, day 1 or another date. Precision must survive reads/writes. Backend nullable versus omitted semantics and storage representation require agreement.
- description: optional plain text, proposed maximum 5000 characters; preserve line breaks, render as text (no HTML).
- referenceUrl: optional absolute HTTP/HTTPS, proposed maximum 512 characters. Reject embedded login credentials, controls, spaces and backslashes. No server fetch/availability validation. Invalid legacy links are hidden behind a correction notice; valid links use target=_blank and rel=noopener noreferrer.

Honour adds stable server-generated id, revision and position. honourDraft strips record metadata. Optional unknown details are omitted from rendering. The adapter should normalize backend nulls to empty UI strings and map deliberate clearing back to agreed null values without silently overwriting unrelated fields. All names/limits remain provisional until Maria/Dalia confirms the contract.

## Proposed service shape and integration

HonoursService = CollectionService<Honour, HonourDraft>:
- load(): Promise<Honour[]> returns authoritative owner-scoped entries in stable position order.
- create(draft): Promise<Honour> returns canonical persisted fields, id, revision and position.
- update(id, expectedRevision, draft): Promise<Honour> returns canonical fields/new revision, preserving id/order.
- remove(id, expectedRevision): Promise<void> resolves after confirmed deletion.

No live endpoint routes are agreed or called. A future authenticated adapter maps this UI draft to agreed create/partial-update payloads and nullable clearing, and maps version conflicts to HonourConflict. Connect that adapter to HonoursSection in profile-hub.tsx; never connect honours-preview-service there. The preview adapter is isolated to components/dev/honours-preview.tsx and app/dev/honours/page.tsx.

## Maria/Dalia backend requirements

Provide authenticated owner-scoped CRUD using verified Supabase identity. Derive ownership server-side, enforce API checks and appropriate RLS, and test cross-user denial. Never trust client owner IDs. Define stable IDs, deterministic ordering/reorder, list bounds/pagination and account deletion behavior. Preserve other collections/associations.

Revalidate title, optional text lengths, precision-preserving dates and safe URL syntax server-side. Agree nullable/omitted partial updates and complete canonical responses. Do not claim reference URLs prove an award's validity. Manual corrections after future parsing must stay supported; parsing should produce reviewable drafts requiring explicit confirmation, not overwrite user corrections.

Agree safe structured validation errors, unauthorized/forbidden/not-found policy, throttling/unavailability and retry behavior. Current UI shows actionable generic failures and retains drafts. Revision/ETag conflicts must not silently overwrite another edit: map to HonourConflict, keep the draft and require Cancel then Reload. Current Cancel deliberately discards that draft; no automatic merge is attempted. Define create idempotency/reconciliation after uncertain network outcomes, delete not-found handling and post-write refresh behavior before real integration. The preview's deterministic one-shot failures do not model a request committed before a lost response.

No backend, schema, matching, dependencies, environment or hosted configuration changes are included.

## Verification

Focused controlled-hook and isolated in-memory tests cover required/optional validation, date precision, URL safety, optional rendering, CRUD/IDs/order, failure/conflict simulation, stale revisions, Cancel/Escape, duplicate submissions, pending cancellation protection and production gating. Profile completion hub tests include the new section without altering calculation behavior. These are not browser or real-service CRUD tests. Command results are recorded after execution. Manual browser/mobile verification and real-service persistence remain pending.

Automated results: `node --test tests/*.test.mjs` passed all 109 auth/B4 tests, including 10 Honours tests. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Scoped whitespace/conflict-marker checks also covered new/untracked files. Production gating is tested at the route function; actual browser/mobile/keyboard and deployed HTTP verification remain pending. No real-service award persistence is available yet.
