# Experience frontend and proposed backend handoff

Implemented on feature/bianca-profile-resume-hub in the original complete application.
No endpoint, database, environment, dependency or hosted changes. Contract below is PROVISIONAL.

## Real page versus development preview

The authenticated Profile page now has a real Experience section instead of its neutral placeholder. With no injected service it displays an unconnected warning, allows drafting and validation, and has a disabled "Saving unavailable" control. It never loads fabricated entries, shows a false known-empty list, or claims a successful save. Cancel/Escape discard drafts. Leaving/reloading loses them. Other five optional collections remain unconnected cards.

The existing profile editor, Skills, Profile Completion (same eight items), Resume links, Jobs, sidebar, auth/onboarding and matching are unchanged. Experience is not counted or used in matching.

Development preview: http://localhost:3000/dev/experience, while running npm run dev from apps/web. It is a separate explicitly labelled page outside authenticated profile operations. NODE_ENV must equal development; the route calls notFound() in production and is noindex. It starts with no entries. An in-memory service supports load/create/update/delete, revision conflicts and simulated failures. Reload resets the service. No localStorage, samples, network persistence or account data. Use only synthetic data.

Preview instructions:
1. Open /dev/experience. Select Add experience; enter role, organization and YYYY/YYYY-MM dates, then Save.
2. Edit an entry; Cancel restores the saved entry. Save confirms the adapter's returned record.
3. Delete requires explicit confirmation. Keep entry or Escape cancels. Focus initially goes to Keep entry.
4. Simulate next failure before a save/delete (or before reloading the collection after a load error). Draft/entries remain available on write failure. The adapter can also simulate load failures in tests.
5. Browser reload intentionally returns to a fresh empty preview. This is not production persistence.

## Reusable frontend boundaries

- lib/experience.ts: provisional draft/entry types, partial-date validation, blank-draft construction.
- CollectionService<T,D>: injectable async load, create, update(id, revision, draft), remove(id, revision). Instance should be stable during a mounted collection session.
- CollectionView<T>: discriminated unconnected/loading/error/ready state, stable keyed rendering and retry. A known empty array is shown only after a successful load.
- ExperienceSection: drafts/validation/selection/confirmation/pending/errors are local UI state; saved list changes only after a service resolves. It never writes directly to an endpoint or storage.
- lib/experience-preview-service.ts: development-only consumer's in-memory adapter; independent instances, cloned responses, stable IDs/order and revision checks. No production page instantiates it.
- New preview route/client wrapper enforce clear access/preview labeling. Production route gating is tested.

The form uses shared rounded controls, labelled required fields, linked field errors, keyboard-native buttons/checkboxes, Escape cancel, focus on form opening and first invalid field, a nonmodal inline delete-confirmation group, and responsive one/two-column date layout. During mutations duplicate submissions are blocked and Cancel is disabled rather than pretending an already-submitted operation was undone.

## Proposed Experience contract (NOT agreed routes or schema)

Current UI draft:
- role: required text, proposed 1-255 trimmed characters.
- organization: required text, proposed 1-255 trimmed characters.
- location: optional text, proposed maximum 255 characters.
- startDate: required partial-date string, YYYY or YYYY-MM.
- endDate: partial-date string, required unless current; empty UI value when current.
- current: boolean.
- description: optional multiline responsibilities, proposed maximum 5000 characters.
- achievements: draft multiline text, one bullet per line; persisted entry uses string[]. Proposed maximum 20 nonblank bullets, 500 characters each.

Proposed returned entry also has id, revision (currently number), position and achievements:string[]. experienceDraft strips those metadata fields when opening an edit. No user_id can be supplied by the UI. A future HTTP adapter must map this provisional camelCase representation to the agreed API; there is no agreed live route.

Dates must preserve supplied precision: year only stays year only, and month precision stays month precision. The validator accepts years 1900-2100, rejects invalid months, day-level strings and definitely reversed ranges. It does not impose a January date or day 1. Same-year dates where only one side has a month cannot be definitively ordered, so are not rejected as reversed. Current=true disallows an end date. Agree backend null versus missing values, precision representation and requiredness before connecting. These are proposed UI constraints, not existing backend validation.

## What Maria/Dalia must implement and connect

1. Authenticated owner-scoped list/create/partial-update/delete operations, stable server-generated IDs and canonical persisted responses. No endpoint paths are agreed in this subtask.
2. Derive owner from verified Supabase identity; never trust a submitted owner. Enforce ownership in API and RLS for read/write/delete, including USING/WITH CHECK. Prevent cross-user ID, ordering or revision manipulation. Confirm deletion/retention on account removal.
3. Agree list ordering and position/reorder behavior, pagination/limits, timestamps and revision/ETag representation. Updates preserve stable IDs and ordering. Reject stale revisions with a conflict response rather than overwriting another edit or parsed correction.
4. Validate text lengths, bullet limits, required fields, date precision/ranges and current/end-date consistency on the server. Define explicit nullable clearing versus omitted PATCH fields. Treat descriptions/bullets as text, not trusted HTML.
5. Return safe structured errors: validation field map, unauthorized, forbidden/not-found policy, unavailable, throttled and conflict. The future service adapter should normalize these into useful UI outcomes; current disconnected/preview UI gives safe generic retry/conflict guidance. No raw provider/SQL error bodies should reach the UI.
6. Confirm create idempotency keys/retry reconciliation so an unconfirmed create does not duplicate on retry. Define delete retry behavior for already removed IDs. The preview adapter is a UI test tool, not a distributed idempotency/security implementation.
7. Return complete persisted entries from create/update and confirm delete before UI removal; clarify load-after-write and uncertain-network-failure semantics. Add a real service adapter and inject it only after these contracts and tests exist.
8. Coordinate with future PDF parsing drafts and explicit confirmation. Manual editing must remain supported; later parsing must not silently replace user corrections. Experience must not change completion/matching without a separate product/backend agreement.

Future Projects/Certificates/Honours/Languages/Publications can reuse the typed service/state renderer and transaction UI patterns, with separate draft validation. Their fields/CRUD remain pending.

## Verification and limitations

Automated: node --test tests/*.test.mjs (79 passed), lint, typecheck and production build. Final task report records the completed results. Tests exercise the real component event handlers with controlled hooks and the in-memory adapter: required/date/bullet validation, Cancel/Escape, CRUD, conflicts, clone safety, load/write/delete failures, pending submission guard, state semantics, native labels/controls and responsive layout classes. Production preview route rejection is executed in a test; no live production runtime configuration is altered.

A direct GET to the running development preview returned HTTP 200 with the preview title and memory-only disclaimer. This does not verify browser interaction, keyboard traversal, actual focus or visual/mobile layout. Those manual checks remain pending. No real-service Experience operation exists or was tested.

An initial typecheck found a discriminated-union narrowing issue in CollectionView; the state union was corrected before final verification.

Manual checklist:
- On real Profile, draft then Cancel; saving must remain unavailable and existing profile/skills/resume persistence must still work.
- In preview, add year-only and month-precision dates; use current checkbox and test reversed/invalid dates. Confirm no invented day appears.
- Add/edit/delete with keyboard; confirm focus, Escape/Keep entry, pending controls, failure retry and draft retention.
- Check desktop and narrow mobile wrapping, labels, field errors, confirmation and long descriptions/bullets.
- Reload preview: entries disappear as promised; production /dev/experience must return 404.
''