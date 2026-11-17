# B4 Step 3: Profile skills

Status: implemented locally on feature/bianca-profile-resume-hub; awaiting real-backend manual verification and review. No commit or push.

## Behavior and API contract

- Profile loads selected skills from authenticated GET /api/v1/profile/skills. A failed read is an error, not an empty list; Retry loading skills is available.
- Suggestions use the complete GET /api/v1/skills array. Filtering is case-insensitive in the client, excludes selected names, deduplicates normalized names and shows at most ten. No search query parameters are sent.
- The current backend permits custom names via POST /api/v1/profile/skills with {name}. Names are trimmed/lowercased, nonempty and at most 100 characters.
- Ordinary removals use DELETE /api/v1/profile/skills/{encodedName}. FastAPI's existing single-segment route cannot accept slash names such as CI/CD; those use the existing PUT /api/v1/profile/skills with the freshly fetched remainder. The replace endpoint's 100-name limit is checked before writing. This is a whole-list operation; simultaneous edits in another tab/device cannot be made atomic without backend support.
- Every mutation authenticates afresh, reads current skills to avoid duplicate writes, then reads the authoritative list again after writing. Mutation response bodies and optimistic local values do not become the displayed list.
- During saving, repeated submissions and removal controls are disabled. Failures retain the previous confirmed list and expose retry/refresh. A write can succeed while its confirmation read fails; refreshing or retrying reconciles that state without duplicating the skill.
- Successful writes invalidate /profile and /jobs even if the confirmation read then fails. Subsequent matching requests use persisted data; fixture tests do not prove that a particular score changes.
- Reusable SkillChip and SkillAutocomplete components use existing shared UI and semantic tokens. Combobox supports arrows, Enter and Escape, labelled remove buttons and announcements.
- Onboarding's implementation/flow remains unchanged. B4 Step 2 profile edits, Save/Cancel and drafts are retained. No resume, completion or preferences feature was added.

## Verification (this original worktree)

Automated, synthetic/local:

- node --test tests/auth.test.mjs tests/recovery.test.mjs tests/profile.test.mjs tests/profile-skills.test.mjs: 40 passed.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed using existing local configuration. An initial attempt hit EBUSY because the isolated test browser held a file under .next; closing that browser resolved it.
- git diff --check and whitespace checks on new Step 3 files: passed.
- node tests/browser-profile-skills.mjs: passed in extension-free headless Edge at desktop and 320px mobile widths, using only loopback synthetic services. Covered persisted reads, case-insensitive duplicate rejection, keyboard selection/Escape, pending state, draft preservation, custom skills/reload, failed removal/retry, slash-name fallback, catalog failure/retry with custom additions, selected-read failure/retry, duplicate submissions, rounded mobile controls, subsequent match requests and unchanged onboarding save.
- node tests/browser-profile.mjs: passed again against the same synthetic services, covering B4 Step 2 editing, partial PATCH, nullable clearing, retry, duplicate submission, completion guards and mobile form.
- Browser fixtures require tests/local-services.mjs on 8300/8301 and a separately built/started frontend on 3102 with process-only synthetic configuration, plus isolated Edge CDP on 9338. These are test tools only, not application routes. Close the browser/frontend before a normal build because Next cleans .next.

No new B4 Step 3 manual checks against hosted Supabase/real FastAPI have been confirmed. Earlier B3 confirmations do not establish B4 persistence or authorization.

## Manual checklist (real backend, pending)

1. Sign in and open Profile. Compare chips with GET /api/v1/profile/skills. Type mixed-case text; check selected names are excluded and no more than ten suggestions appear. Use arrows, Enter and Escape.
2. Add an existing suggestion and a custom skill, including CI/CD. Confirm saving feedback and the backend results, reload the page and check persistence. Try adding the same name with different case: no duplicate.
3. Remove skills (including CI/CD); reload and verify remaining skills are unchanged. Simulate a failed API request, verify the previous confirmed chips and entered custom name remain, then restore connectivity and retry/refresh.
4. Keep an unsaved profile edit while changing a skill; verify the draft survives, then Cancel. Open onboarding in edit mode and verify it sees the updated skills without changing its flow.
5. Open Jobs after saving and confirm a fresh match request. Check Profile on mobile/desktop, keyboard focus, chip wrapping and readable error states. Sign out and confirm protected access; with a second test account verify skills remain isolated.

## Change boundaries

New Step 3 files: profile/skills-actions.ts, components/profile/profile-skills.tsx, skill-chip.tsx, skill-autocomplete.tsx, lib/profile-skills.ts, tests/profile-skills.test.mjs, tests/browser-profile-skills.mjs and this document.

Step 3 adds only the Skills integration to the already modified profile/page.tsx and extends the already modified tests/local-services.mjs fixtures. All other pre-existing B4 Step 2 and unrelated work is preserved; generated next-env.d.ts is restored to its exact pre-Step-3 contents. Backend, onboarding source, dependencies, environment files and hosted settings are unchanged.

## Autocomplete investigation: 17 November 2026

Observed directly: loading only the frontend API-base configuration through Next's environment loader resolves GET /api/v1/skills to http://127.0.0.1:8000/api/v1/skills. A read-only request to that URL returned HTTP 200 and seven {id, name} objects: c/c++, data structures and algorithm, java, javascript, object-oriented programming, python and typescript. No environment values other than the non-secret API URL were printed.

The screenshot's selected set contains all of these except java. Query java therefore leaves exactly java after case-insensitive filtering (javascript is excluded). The new tests/skills-autocomplete.test.mjs exercises the real API client, catalog Server Action, ProfileSkills effect/state updates and SkillAutocomplete render tree with that exact catalog and selection. Transport and React hook scheduling are controlled test doubles; this is not an authenticated browser, actual React lifecycle, CSS/computed-style or live Supabase test.

Frontend path inspected: ProfileSkills mount -> getSkillSuggestions Server Action -> getAccountState (verified Supabase identity and authenticated profile) -> account.api.request("/api/v1/skills") -> createApiClient URL resolution, no-store GET and response validation -> catalog state -> SkillAutocomplete client filtering. The local environment resolves to the running backend above; an override or stale data in the already-running authenticated frontend process has not been observed or ruled out.

Confirmed usability defects addressed:
- Successful empty catalog, selected-only matching results and no matches had shared ambiguous copy; they now have distinct messages, separate from loading and request errors.
- Catalog loading previously happened on mount, with retry only after failure. Refresh suggestions is now available after success as well, preserving the typed query.
- Missing/malformed action payloads cannot silently become a successful empty catalog in the consumer.

The original screenshot's root cause remains unconfirmed. A controlled stale-catalog test demonstrates recovery with Refresh suggestions, but does not prove that stale data caused the screenshot. No authenticated browser verification or computed-style/focus inspection was possible in this investigation; browser access had been blocked by URL-policy enforcement.

Verification for this follow-up: 45 Node tests passed (five new integration/state cases), npm run lint passed, npm run typecheck passed, git diff --check passed. Production build was not rerun for this follow-up; the user's running development frontend was left running.

Manual next step: reload Profile, focus the skill input, search java, and use Refresh suggestions if needed. For the supplied selected set, java must appear. If it still does not, the outstanding evidence is the authenticated Server Action response and component catalog state from that session. Do not add/remove skills solely to diagnose this read issue.
