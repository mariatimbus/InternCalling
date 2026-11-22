# Languages frontend handoff

Original complete application on feature/bianca-profile-resume-hub. Frontend implemented; backend fields, persistence and routes remain unconfirmed.

## Implemented versus pending

Profile now includes Languages instead of the generic unconnected card. Without an injected service it makes no language requests and does not assume an empty account. Users can draft, Validate draft, Cancel or Escape; saving is explicitly unavailable and drafts disappear on navigation/reload. Validation only confirms field rules; existing-account duplicate checking requires a connected authoritative list. No entry or saved success is simulated on real Profile.

LanguagesSection reuses CollectionView, CollectionService and shared Input/Select/Button/URL validation. Typed states distinguish unconnected, loading, load error/retry, ready-empty, confirmed entries, pending mutations, failure/retained drafts, duplicate and revision conflict. Writes show success only after the injected service resolves with canonical results. Save/update/delete have synchronous duplicate-submission guards and prevent Cancel/Escape while pending. Deletion requires confirmation. The title field receives focus on opening, invalid fields receive focus, confirmation starts on Keep entry, and Cancel/Escape/success focus the section heading. Native checkbox and CEFR select are keyboard accessible, with associated labels and field errors; action groups wrap and form columns collapse on mobile. Browser/mobile checks remain pending.

Proficiency starts unspecified. Native is separate from CEFR, never inferred as C2. Checking Native clears and disables CEFR; unchecking leaves CEFR unspecified rather than restoring an old selection. Rendering explicitly distinguishes Native language, CEFR level and Proficiency not specified. Product copy says proficiency is self-reported and references do not verify/certify it. Optional reference names/links are omitted if absent. Unsafe legacy links are nonclickable correction notices. Valid links open with noopener noreferrer and an accessible new-tab announcement. No reference URL is fetched to check availability or validity.

Profile editor, Skills drawer/mutations, Resume links, completion, Experience, Projects, Certificates, Honours, Jobs, onboarding and authentication remain intact. Languages are not part of the eight-item completion formula and add no matching behavior.

## Proposed model (NOT a confirmed schema)

LanguageDraft uses provisional camelCase names:
- name: required trimmed plain text, proposed 1-255 characters. Display preserves user casing.
- cefr: optional A1/A2/B1/B2/C1/C2; empty UI string means unspecified. Proposed backend null maps to empty UI string, with deliberate clearing mapped back to null. Never default to a proficiency.
- native: explicit boolean, initially false. True requires cefr empty/null. False plus null cefr means unspecified; false plus a valid level means self-reported CEFR. Native is neither a level nor certification.
- referenceName: optional plain text, proposed maximum 255. Does not establish an actual certificate or verified proficiency.
- referenceUrl: optional absolute HTTP/HTTPS, proposed maximum 512; no embedded credentials, control/space/backslash ambiguities, relative or executable URLs. Blank UI maps to agreed null semantics.

Language adds stable server id, revision and position. languageDraft strips metadata. Agree actual names/limits, nullable/omitted update semantics and response types with Maria/Dalia before connecting. Do not silently overwrite unrelated fields when mapping a full UI draft to a partial-update API.

## Name normalization and duplicates

normalizeLanguageName uses trim().toLowerCase(). Both loaded-list validation and the preview service exclude the current entry by ID when editing. Create and rename-to-another-entry are rejected for equivalent names, including surrounding whitespace/case differences. No translation, language-code inference, aliases, accent folding or internal-whitespace collapsing is implemented. Existing IDs/names must be preserved; do not automatically merge records.

The future backend must enforce owner-scoped uniqueness atomically, using agreed normalization consistent with this rule. Client filtering is insufficient for simultaneous writes or stale lists. If existing duplicates are discovered during integration, report them for a reviewed migration/resolution instead of deleting/renaming records. Map duplicate responses to LanguageDuplicate; the frontend retains the draft, highlights name, and asks for Cancel/Reload to review the authoritative list.

## Proposed injectable service (NOT agreed endpoints)

LanguagesService = CollectionService<Language, LanguageDraft>:
- load(): Promise<Language[]> returns authoritative owner entries sorted by stable position.
- create(draft): Promise<Language> returns canonical persisted data/id/revision/position.
- update(id, expectedRevision, draft): Promise<Language> preserves ID/order and returns a new revision.
- remove(id, expectedRevision): Promise<void> resolves after confirmed deletion.

No live endpoints are agreed or called. Connect a future authenticated adapter to LanguagesSection in components/profile/profile-hub.tsx. It should convert nulls, errors and partial-update values deliberately, and map concurrency errors to LanguageConflict. Never inject languages-preview-service into real Profile.

## Maria/Dalia backend dependencies

Provide authenticated owner-scoped CRUD using verified Supabase identity, API ownership checks and appropriate RLS; derive owner server-side and test cross-user denial. Define stable IDs, ordering/reorder, collection limits/pagination, account deletion and canonical complete responses. Revalidate names, uniqueness, lengths, enum/native mutual exclusion and URL safety server-side. Never infer verified status or C2 from Native or the presence of a reference.

Agree validation errors and safe auth/forbidden/not-found/rate-limit/unavailable responses. Current generic failures preserve entered values/confirmed entries and allow retry. Version/ETag conflicts must prevent stale overwrites, retain draft/deletion target and request Cancel then Reload; Cancel deliberately discards edits. Define create retry idempotency/reconciliation after uncertain network outcomes, delete not-found behavior and post-write refresh semantics before real integration. The memory adapter only models deterministic failures before mutation, not lost responses after a committed write.

Future parsing must preserve manual editing and user corrections. Parsed drafts require review and explicit confirmation; never silently assert proficiency, native status or certification.

## Development preview and manual checklist

From apps/web run `npm run dev`, then open http://localhost:3000/dev/languages (or the actual development server port). This explicitly labelled temporary memory preview starts empty; reload clears it. No samples, real accounts or localStorage are used. Production/non-development invokes notFound() before rendering and the route is noindex.

Simulate next failure rejects the next load/create/update/delete once without mutating records. Simulate next edit/delete conflict rejects the next update/remove once as LanguageConflict; create/load do not consume the flag. Actual stale-revision checking also exists independently. Use Cancel/Reload before retrying a conflict.

Manual browser/mobile checks remain pending:
1. On real Profile, draft and validate blank/whitespace names, fill valid fields, Cancel/Escape, reopen. Saving stays unavailable and drafts are not persisted.
2. Preview: add with name only. Confirm Proficiency not specified. Edit to CEFR B2; select Native and verify CEFR clears/disables. Uncheck Native: level stays unspecified. Save each state and reopen to confirm the returned data.
3. Attempt duplicate create and rename using surrounding whitespace/different casing. Same-entry edits remain allowed. Check an unsafe reference URL is rejected; valid links open safely and absent reference fields stay absent.
4. Cancel an edit, Keep entry/Escape during deletion confirmation, then Confirm delete. Test failure/retry for create/edit/delete/load and simulated edit/delete conflict. Rapid repeated submission must cause one write.
5. Check Tab/Shift+Tab/Enter/Escape, first-field/error/confirmation focus, visible keyboard focus, narrow mobile/high zoom wrapping and no overflow. Recheck existing Profile, Skills and Resume behavior. Reload clears preview entries. Production URL must be 404.

## Verification

Focused controlled-hook and isolated memory tests cover required fields, trimmed/case-insensitive duplicates and self-edit exclusion, enum/native/unspecified transitions and persistence, safe links/rendering, Cancel/Escape, CRUD/IDs/order, failures, conflicts, duplicate service errors, pending duplicate prevention and preview gating. Profile completion integration tests include Languages and preserve the eight-item calculation. These are not browser or real-service CRUD tests. Actual command results are recorded after execution; browser/mobile and connected backend verification remain pending.

Actual automated results: `node --test tests/*.test.mjs` passed all 122 auth/B4 tests, including 13 Languages tests. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Scoped whitespace/conflict-marker checks also covered new/untracked files. Production preview gating is tested through the route function, not deployed HTTP. Browser/mobile/keyboard verification and real-service language persistence remain pending.
