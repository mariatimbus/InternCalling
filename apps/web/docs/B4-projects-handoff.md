# Projects frontend and Experience display correction

Original worktree, feature/bianca-profile-resume-hub. Frontend only; no live endpoints agreed.

## Experience correction

Three literal question-mark separators were present in experience-section.tsx: organization/location, date range and the draft-only notice. They are now ASCII-safe " / ", " to " and " - ". No user text is searched/replaced or altered. A regression test preserves a question mark in "Microsoft?" while checking the corrected separators.

## Real page and development preview

Profile now includes a Projects section instead of the generic unconnected card. With no injected service, users can draft and validate a project, select/remove technologies, and Cancel/Escape. Saving is disabled and explicitly unavailable; there are no fake saved entries, network persistence or success claims. Profile Completion remains eight items and Projects do not affect matching.

Development: run npm run dev from apps/web and open http://localhost:3000/dev/projects. The labelled in-memory adapter starts empty, supports load/create/update/delete and one-shot simulated failures, clones returned records, preserves IDs/order and rejects stale revisions. Reload clears all entries. The route rejects production with notFound() and is noindex. It does not load real accounts or sample records.

Preview steps:
1. Add project; only name is required. Optionally add role, description, dates, technologies and repository/demo links.
2. Use Ongoing: end date clears and becomes inapplicable. Test year-only and month precision, invalid month/reversed ranges and unsafe URLs.
3. Save, edit, Cancel, then save another edit. Delete requires Keep entry/Confirm delete; Escape cancels.
4. Arm Simulate next failure before Save/delete. Retry must preserve draft/record. A failed create cannot show a saved item.
5. Reload: temporary projects disappear. Verify desktop/mobile wrapping, keyboard focus and safe external links.

## Reused UI boundaries

- Generic CollectionService from Experience: load/create/update/remove with expected revision.
- CollectionView: unconnected/loading/ready-empty/error; optional emptyMessage supports both sections.
- Shared partial-date validation and shared HTTP/HTTPS URL validation; no arbitrary URL fetch.
- Shared SkillChip supports name-only draft items. GroupedSkillPicker also accepts selected names without invented database IDs and hides Refresh suggestions when no refresh callback exists.
- Project technologies use the approved local category/alias adapter. Picker additions update only draft.technologies. No user profile skill mutation or catalog import is called.
- Technology suggestions use an independent form outside the Project form; the external Save button targets the Project form by ID. No nested forms. Escape closes suggestions without cancelling the whole project.
- Existing Experience, Skills, Resume, completion, auth, onboarding and Jobs flows remain in place.

## Proposed contract: not confirmed backend schema/routes

ProjectDraft fields:
- name: required, proposed 1-255 trimmed characters.
- role: optional, proposed maximum 255.
- description: optional plain text, proposed maximum 5000.
- technologies: distinct normalized name strings, proposed maximum 100, each 1-100 characters. These are project associations, not additions to the user's profile skill set.
- startDate/endDate: optional YYYY or YYYY-MM; empty UI strings mean unknown/unprovided. Proposed year range 1900-2100.
- ongoing: boolean; true clears/disallows end date.
- repositoryUrl/demoUrl: optional absolute HTTP/HTTPS URLs, maximum 512, no embedded credentials or ambiguous control/backslash values.

Project adds stable server id, revision and position. projectDraft removes metadata from editable drafts. This camelCase UI/service shape and all limits are provisional. No live route names are proposed as agreed.

Dates must not invent days or months. Compare only known precision: reject definitely reversed years or months when both months are known, not ambiguous same-year mixed precision. Agree nullable versus omitted PATCH values and date storage before connecting; do not coerce unknown dates into January/day 1.

## Maria/Dalia backend work

- Authenticated owner-scoped read/create/partial-update/delete; stable server-generated IDs, canonical persisted responses, ordering and version/ETag conflicts.
- Derive ownership from verified identity; enforce API ownership and RLS for all operations, including technology association writes and reorder. Never trust client owner IDs.
- Agree nullable clearing, field limits, complete responses, collection bounds/pagination, ordering/reordering and account-deletion behavior.
- Agree technology name versus existing skill-ID representation and handling of custom technologies. Preserve existing catalog IDs and associations. Do not implicitly add project technologies to profile skills or merge aliases. Alias discovery does not change matching.
- Revalidate dates, URL syntax/length and plain-text fields server-side. URL availability is not checked by this frontend; invalid legacy links are rendered as nonclickable correction notices. Safe links use target=_blank with noopener noreferrer.
- Return safe validation field errors, auth/forbidden/not-found policy, throttling/unavailability and conflict codes. The future adapter should map concurrency conflicts to ProjectConflict; current UI retains the draft, asks the user to cancel and reload, and offers Reload projects outside editing/deletion.
- Specify create retry/idempotency and delete reconciliation. The preview adapter is not a distributed persistence implementation.
- Manual editing after future parsing must remain supported. Parsing drafts need explicit confirmation; do not overwrite user corrections or add match-score effects.

No backend/database/importer/dependency/environment/hosted setting is changed.

## Tests and limitations

Project tests cover required/optional fields, partial dates, URLs, deduplication, CRUD, stable IDs/order, conflicts, failure retention, draft-only mode, Cancel, pending duplicate-submit guard, safe links, loading/error retry and production preview gating. Experience has a separator/user-text regression test. Existing auth/B4 tests also run.

Tests use controlled hooks and in-memory services. They do not replace actual browser keyboard/mobile visual checks or verify real-service CRUD, which is not connected. Real-service manual checks remain pending.

Changed source: new projects.ts, projects-preview-service.ts, ProjectsSection, ProjectsPreview and /dev/projects page. Integration updates ProfileHub/placeholder cards, generic CollectionView, name-only technology selection/chips and the shared picker. Tests and this handoff are included.

Actual checks: 86 Node auth/B4 tests passed; npm run lint, npm run typecheck, npm run build and git diff --check passed. New-file whitespace checks passed. Development /dev/projects returned HTTP 200 with its preview/memory disclaimer. Real-service persistence and actual browser mobile/keyboard verification remain pending.
