# Profile Skills: grouped local discovery and backend handoff

Implemented locally on feature/bianca-profile-resume-hub. The frontend adapter change itself did not import data or change the backend.

Delivery update: Maria approved the catalog and its import was subsequently confirmed: 143 total skills, all 140 approved names present, 132 inserted, with existing IDs/names/associations preserved. The user confirmed grouped discovery and skill add/remove persistence after refresh. See [B4 delivery](B4-delivery.md) for current verification boundaries and integration status; other historical pending-import statements below describe the earlier preparation state. Backend category/alias metadata remains unconnected, and the frontend still uses the approved JSON for grouping.

## Actual behavior

Profile keeps its removable saved-skill chips and existing authenticated mutations. The new grouped picker offers every source category, six initial choices per category, native expand/collapse buttons and incremental Show more. Every skill can be reached; no whole-catalog ten-result cap applies. Search filters all names/approved aliases while retaining category groups. Available suggestion counts exclude selected names; search arrow keys navigate only visible skill options, not group labels. Tab reaches category toggles, Show more and real skill buttons; these remain usable even when the search popup is closed.

Selecting an alias or submitting an exact alias uses its canonical name. Custom names remain supported. Failed additions retain the query; only the existing action's confirmed result changes saved chips/completion. In-flight guards prevent concurrent duplicate additions. Alias discovery is not alias-aware scoring and does not merge IDs or legacy associations.

GET /api/v1/skills still loads the full live array. Exact normalized canonical records retain their actual record IDs/names in the adapter. Unclassified live records remain under Other skills; aliases in existing DB rows are not silently renamed or merged. Unknown API loading/failure states are shown separately from local no-match/already-selected results. Suggested categories and custom additions can remain available during live-catalog failure, provided the user's selected skills were loaded successfully. Initial selected-skills failure still disables mutations.

## Single source, bundling and authorization

src/lib/skill-discovery.ts directly imports database/seeds/skills_catalog.proposed.json. No 140-entry list is manually duplicated, generated, seeded or stored in localStorage. Only nine readable UI labels are mapped locally; source category identifiers/order, canonical names and aliases come from that JSON.

The file remains historically marked proposal-only and its original purpose text predates this subtask. The user's explicit instruction authorizes its use as local discovery metadata here; it does not prove shared-database import or create a publication/approval ledger. The source file and importer are unchanged. This adapter supersedes the earlier catalog proposal's prohibition on frontend fallback only for this explicitly requested local discovery feature.

Next's resolveJsonModule support is already enabled. The existing explicit Turbopack root was apps/web and excluded the shared file. next.config.ts now uses the repository root. A production build verifies the external JSON is bundled; runtime does not fetch arbitrary repository files or require a second data copy. This shared JSON contains catalog metadata only, no secrets or personal data.

A proposed-only choice has a name and aliases, with no record/id. Existing live records are attached as record: Skill. Selection always passes a name to the unchanged custom-capable POST action, which creates/reuses the actual database record and confirms with GET. Never expose a generated UI identifier as a database skill ID.

## Proposed backend shape (NOT an agreed contract or route)

- Category: id (stable slug), label (English), position (stable ordering).
- Skill: id (existing UUID), name (canonical/actual stored name), aliases (discovery metadata).
- Association: category_id, skill_id, position; define multiple-category membership explicitly.
- Authenticated selected skills retain the current read/mutation contract. Categories are discovery data, never user-owned skill IDs.
- Specify unknown/loading/failure versus known-empty data, response validation, stable ordering, alias collisions and pagination/full-array semantics before integration.

Maria/Dalia can replace the adapter's local input with backend categories/associations after agreement. Preserve existing skill IDs, names and user/opportunity associations; do not apply automatic alias resolution. Current adapter displays a repeated canonical entry once in source order, preventing duplicate choices; mutation guards also normalize/deduplicate. A future many-to-many presentation may repeat display placement but must share the same canonical identity.

Prepared review artifacts already exist: skills_catalog.proposed.json, SKILLS_CATALOG_PROPOSAL.md, SKILLS_CATALOG_IMPORTER.md and ingestion/skills_catalog.py. The current user authorizes the category structure for this UI; target confirmation and explicit authorization are still required before any shared --apply. No import was performed in this subtask. Importing names alone does not add backend category or alias fields.

## Compatibility and scope

Onboarding's own skill flow is unchanged. Existing skill mutation actions, normalization, profile editor, completion formula, Resume links, matching, auth and workspace remain unchanged. The prior live-only SkillAutocomplete component/helper remains as a standalone implementation with existing tests; Profile now mounts GroupedSkillPicker. No dependencies, environment, database or hosted settings changed.

New files: skill-discovery.ts, grouped-skill-picker.tsx, tests/grouped-skills.test.mjs and this handoff.
Extended: profile-skills.tsx (picker import), next.config.ts (shared JSON root), profile-completion.test.mjs and skills-autocomplete.test.mjs (child dependency fixtures).

## Verification and pending manual checklist

Focused tests cover all nine categories/140 names, no invented IDs, Show more reachability, expand/collapse, grouped alias search, selected exclusion, live-record preservation, Other skills, deduplication, keyboard active-option semantics, API failure with local suggestions, and confirmed/failed additions. Existing mutation/onboarding/auth/B4 tests also run. Test harnesses are controlled component/state tests, not actual browser or hosted-service verification.

Pending manual checks:
1. Browse every category and Show more on mobile/desktop; collapse/reopen with keyboard.
2. Search JS and verify JavaScript appears under its category. Use arrows/Enter; headings must never become selected. Verify search and category focus remain visible.
3. Add a source-only canonical skill, wait for backend confirmation, reload and verify the actual persisted record. Repeat normalized name/alias attempts: no duplicate additions.
4. Verify an unclassified live skill in Other skills; remove a saved chip and check it becomes available again.
5. Simulate live catalog failure: explicit error/retry, local categories/custom input still usable; simulate selected-skills read failure: saving remains disabled.
6. Check onboarding, Profile Completion, Resume links and returning Jobs matches.

Actual results: node --test tests/*.test.mjs: 72 passed; npm run lint, npm run typecheck, npm run build and git diff --check passed. New-file whitespace checks also passed. No real-service manual check is marked passed.
