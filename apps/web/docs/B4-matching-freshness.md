# B4: matching freshness verification

17 November 2026; original worktree, feature/bianca-profile-resume-hub.
No shared user writes, catalog import, private upload implementation or dependency upgrade.

## Traced production flow

1. Profile Server Action authenticates through getAccountState, reads the current API profile and PATCHes changed fields only. Skills actions authenticate, read current skills, mutate, then read authoritative skills again.
2. Confirmed changes revalidate /profile and /jobs. The transport in lib/api/client.ts uses cache: "no-store" for every API request. React cache() in auth/account.ts is request-scoped identity/profile reuse, not a persistent match-result cache.
3. Returning to Jobs renders the authenticated, completion-guarded server page. It fetches opportunities for the current search/type/page and issues a new GET /api/v1/opportunities/{id}/match per returned opportunity. There is no cached match state or client-supplied profile payload.
4. FastAPI get_db provides a session per request; get_current_user verifies the Supabase identity and returns that user's persisted ORM data. api/opportunities.py constructs MatchingProfile from the current profile and user.skills, then invokes the existing scorer.
5. RecommendedJobs stores selected opportunity ID and drawer state only. Cards and selected Brief derive their match from current items props. Filter/page keys and existing sorting/failure behavior remain intact.
6. Headline/bio are excluded from MatchingProfile. Profile editor/completion help already say they do not affect current matching. Resume links likewise remain outside matching and completeness.

Source inspection includes the installed Next revalidatePath documentation: Server Action invalidation refreshes previously visited affected pages on navigation. This supports the cache reasoning but is not a substitute for an actual browser Router Cache test.

## Frontend defect found and fixed

Normal writes already invalidated both routes. However, the successful no-op profile path and duplicate/already-removed skill paths returned fresh persisted state without invalidating either route. This can reconcile data written in another tab or an earlier unconfirmed request while leaving older visited Jobs results eligible for reuse.

A new regression assertion failed on the original code because revalidatePath calls were absent. Both reconciliation paths now revalidate /profile and /jobs before returning success, without performing another write. Matching, filters, UI text and backend implementation are unchanged.

## Integration test and evidence

Run from apps/web with the existing backend virtual environment available:

~~~powershell
node --test tests/matching-refresh.test.mjs
~~~

tests/matching_backend_fixture.py starts the real FastAPI app/TestClient with a fresh in-memory SQLite database, explicit synthetic Auth configuration and AI disabled. No configured database engine is used. It creates only synthetic opportunities and a synthetic user.

tests/matching-refresh.test.mjs executes the actual frontend transport, profile/skills actions, Jobs server component and RecommendedJobs component against that isolated app. Next account verification and revalidatePath are controlled boundaries. A transparent observer records the real scorer's input and delegates unchanged to the actual score_match function.

Verified:
- Initial matching reads Mathematics/Paris/no selected skills.
- Confirmed profile PATCH saves Computing/Berlin; adding Python uses the real skill endpoint.
- A subsequent filtered Jobs render performs another backend matching request. The observed scorer input contains Computing/Berlin/python; its skills component is six.
- Search=Python, opportunity_type=internship, page=1, page_size=12 and no-store remain intact. The unrelated research record is filtered out.
- Preserving client selection state while replacing props uses the new card score and selected Brief match object.
- Headline/bio saves do not enter scorer input or alter the deterministic match result.
- Removal is reflected in the next match input.
- A direct isolated write followed by a successful no-op/duplicate reconciliation invalidates both routes and subsequent matching sees that persisted data.

Limitations: this is not live Supabase, PostgreSQL RLS, hosted optional AI or actual browser back/prefetch/history automation. It does not require that every edit changes a total score: caps, eligibility and unchanged opportunity requirements can leave scores equal. No new backend freshness defect was observed. Existing multiword/alias scoring limitations remain separate, unchanged backend issues.

## Checks

- Full frontend Node suite, including this test: 66 passed.
- npm run lint: passed.
- npm run typecheck: passed.
- Ruff check of the Python fixture: passed.
- npm run build: compiled/generated pages; first attempt exited with SecurityFatalError. The unchanged retry passed with the same known-vulnerability upgrade warning; no bypass flags were used.
- git diff --check and new-file whitespace checks: passed.

The Python adapter is test-only under apps/web/tests; no backend source/model/schema changes were made.

## Exact security warning and advisory

Installed next/package.json and installed lockfile entry identify Next.js 16.4.2. The build emitted:

~~~text
Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability.

**We strongly recommend you upgrade Next.js.**

This command stopped to show the upgrade recommendation. Retry the same command to continue the original task.
~~~

The warning's reference was:
https://registry.npmjs.org/-/npm/v1/security/advisories/bulk

The generic message does not identify a CVE. A read-only npm advisory bulk request with {"next":["16.4.2"]} returned:
- GHSA-mfr8-8qww-v76h, npm advisory ID 1247486.
- CVE-2026-119790.
- Moderate: information disclosure across root params when a 'use cache' function is called through unstable_cache().
- Affected: >=16.3.0 <=16.4.4. Patched: 16.4.5.

Verified with the publisher's advisory:
https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h

Source search found no 'use cache', unstable_cache or rootParams use in application code/config. That does not prove the application immune; no exploit analysis was performed. The affected installed dependency still warrants a separately approved upgrade. No dependencies, installed entrypoints, agent/security controls or environment settings were changed.

The exact warning when a retry continues is:
~~~text
Your version of Next.js is affected by a known security vulnerability. This command is continuing after the upgrade reminder.
~~~

## Real-service manual test (pending)

1. With an authorized test account, open a filtered Jobs URL and record one opportunity's match reasons/components. Open Profile, update a matching-relevant field or add/remove an existing skill, and wait for confirmed success.
2. Return to the same filtered Jobs URL. Confirm a new backend GET .../{id}/match in backend access logs (browser Network principally shows the Jobs/RSC request because matching is server-to-server). Verify updated explanations/components where applicable; equal total scores are allowed.
3. Repeat after browser back/forward or previously prefetched navigation, and check list plus detail drawer. Verify filters/pagination still work. Save only headline/bio and confirm they are not described as match improvements.
4. Verify failed/unconfirmed saves do not masquerade as successful profile updates. Keep production-user data, tokens and authorization headers out of screenshots/log sharing.

Changed existing files: profile/actions.ts and profile/skills-actions.ts (only reconciliation invalidation).
New files: tests/matching-refresh.test.mjs, tests/matching_backend_fixture.py and this document.
All other B3/B4, resume-link, catalog/importer and unrelated local work is preserved.
