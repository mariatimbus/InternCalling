# Certificates frontend: backend handoff

Status: frontend implemented on feature/bianca-profile-resume-hub; backend contract unconfirmed. No backend, schema, settings, dependencies or real persistence changed.

## Implemented versus pending

The authenticated Profile hub now renders Certificates instead of its generic placeholder. Users can open a draft, fill required name/issuer and optional dates/credential details, validate and Cancel/Escape. The section explicitly states that it is not connected; Save is unavailable. No account certificates are fetched, no empty-account claim is made, and no success or saved entry is simulated on Profile. Drafts are lost on navigation/reload. Existing profile, skills, resume links, completion, Experience and Projects remain intact. Certificates do not enter the eight-item completion formula or matching.

CertificatesSection takes an optional CertificatesService. It reuses CollectionView, CollectionService, partialDate, the shared Input/Button controls and safe HTTP/HTTPS validation. Service-connected states include loading, empty, load error/retry, save/delete pending, canonical confirmed results, success, mutation error with retained draft/record, and revision conflict. Save/delete use a synchronous duplicate-submission guard; pending controls cannot cancel an accepted operation. Form errors are associated with fields, the first invalid field receives focus, forms focus the name input on opening, confirmation focuses Keep entry, and Cancel/Escape/success return focus to the section heading. Layout uses rounded semantic dark-theme controls and responsive date columns.

## Development-only preview

From apps/web, run `npm run dev`, then open http://localhost:3000/dev/certificates (or the development server's actual port). It starts empty. The visible preview notice explains that no real data is saved, all entries are temporary and reload clears them. Simulate next failure arms one load/create/update/delete failure. The adapter preserves IDs/order, clones returned values and rejects stale revisions. This is an isolated demonstration, not a production fallback. Production invokes notFound() before rendering; the route is noindex. No localStorage or sample account entries are used.

Manual browser checks remain pending:
1. On real Profile, Draft certificate, fill fields, Cancel/Escape; verify Save remains unavailable and reopening has no draft. Check existing Skills drawer/editor/resume links still work.
2. In the preview, add with required name/issuer only. Unknown expiration must not render Does not expire. Edit with YYYY or YYYY-MM dates, credential ID and safe link; verify persisted preview response after Save.
3. Select This credential does not expire: expiration clears/disables. Uncheck: expiration remains unknown; no date is invented. Test invalid months, full day dates, definitely reversed ranges, mixed year/month precision and unsafe/credential-bearing links.
4. Cancel an edit; original stays unchanged. Delete requires confirmation; Keep entry/Escape retain the record. Test failure before Save/edit/delete/load, then retry; errors retain drafts/entries and no false success appears. Rapid double-submit must cause one operation.
5. At desktop and narrow mobile widths/high zoom, use only keyboard through labels, checkbox, safe link, errors, Cancel and confirmation. Check wrapping, visible focus and no overflow. Reload clears preview data. Production /dev/certificates must return 404.

## Proposed data model (NOT a confirmed API/schema)

CertificateDraft uses camelCase UI names:
- name, organization: required trimmed plain text, proposed 1-255 characters.
- issueDate, expirationDate: optional YYYY or YYYY-MM strings in the UI; blank means unknown/unprovided. Proposed valid year range 1900-2100. Backend representation and nullable clearing semantics need agreement.
- doesNotExpire: explicit boolean, default false. True requires no expiration date; false plus null/blank expiration means unknown, never non-expiring. It must survive round-trips without inference from absent dates.
- credentialId: optional plain text, proposed maximum 255 characters.
- credentialUrl: optional absolute HTTP/HTTPS URL, proposed maximum 512 characters; no embedded credentials, controls, spaces or backslashes. No arbitrary URL fetch/availability verification is performed.

Certificate adds stable server id, revision and position. Draft conversion strips record metadata. Unknown optional details are omitted from display. Invalid legacy URLs render a correction notice instead of a clickable link. Valid links use target=_blank and rel=noopener noreferrer. URL presence does not verify the issuer or credential.

Dates preserve their precision. Do not fill January, month 1 or a day. Reject reversed years and reversed months only when both months are known; overlapping mixed-precision dates in the same year are not falsely ordered. Agree null versus omitted partial-update values and storage (precision-preserving strings or explicit year/month fields). The frontend limits are provisional and must be revalidated on the backend.

## Proposed service contract (NOT agreed routes)

CertificatesService = CollectionService<Certificate, CertificateDraft>:
- load(): Promise<Certificate[]> ordered by position.
- create(draft): Promise<Certificate> containing authoritative persisted values and metadata.
- update(id, expectedRevision, draft): Promise<Certificate>, preserving stable id/order and returning a new revision.
- remove(id, expectedRevision): Promise<void>, resolving only after confirmed deletion.

No endpoint routes are agreed or called. A future adapter converts this UI draft into the agreed create/partial-update payload (including deliberate nullable clearing) and maps server conflicts to CertificateConflict. Inject it into CertificatesSection from the authenticated Profile hub; never connect the in-memory preview adapter there.

## Maria/Dalia dependencies

Provide authenticated owner-scoped CRUD using verified Supabase identity, per-user isolation/API checks and appropriate RLS. Derive ownership server-side; never trust client owner IDs. Define stable generated IDs, deterministic ordering/reorder capability, limits/pagination and account deletion. Enforce required plain-text/length/date/URL/boolean rules server-side. Agree canonical complete responses, nullable fields and partial-update semantics before integration.

Define validation field errors, safe authentication/authorization/not-found behavior, rate limits/unavailability, and revision/ETag concurrency conflicts. Current generic errors preserve drafts and offer retry; conflicts request Cancel then Reload, retaining the draft until Cancel. Define create retry idempotency and reconciliation after an ambiguous network outcome, delete not-found reconciliation and refresh behavior before real integration. The in-memory synchronous failure simulation does not model uncertain distributed writes. Future typed adapter/error mapping may be extended once the error contract is agreed.

Manual editing after parsing must remain supported. Parsing should produce reviewable drafts and require explicit confirmation; do not overwrite corrections or infer credential validity. Upload/parsing, onboarding changes, tailoring and matching effects are outside this subtask.

## Verification

Focused Node tests cover validation, date precision/non-expiring distinction, safe links, CRUD, load/mutation failure retention, conflicts, Cancel/Escape, duplicate submissions and production preview gating. They use controlled hooks and an isolated memory adapter, not a browser or live backend. Automated command results are recorded after execution; manual browser/mobile and real-service CRUD remain pending (real service not connected).

Actual automated results: 99 auth/B4 Node tests passed, including 9 Certificates tests. npm run lint, npm run typecheck and npm run build passed. git diff --check and separate whitespace checks for new/untracked Certificates files passed. Initial Profile hub fixture failures were fixed by adding its Certificates mock; completion behavior remains unchanged. Manual browser/mobile and real-service CRUD remain pending.
