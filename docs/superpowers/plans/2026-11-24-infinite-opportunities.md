# Infinite opportunities implementation plan

> Execute inline using executing-plans; preserve the existing uncommitted UI changes. No commits or pushes requested.

**Goal:** Replace Previous/Next page navigation in Explore and Recommended with automatic loading of twelve more opportunities at the end of the list.

**Architecture:** Keep the existing paginated API. Server actions validate the next page and preserve public filters or verify the authenticated account before reading recommendations. A shared client hook and observer retain loaded results, deduplicate IDs, block concurrent requests, stop at the end, and expose a manual retry. Key each feed by its search/filter context so an old response cannot populate a new search.

**Tech stack:** Existing Next.js, React, TypeScript, IntersectionObserver, node:test and Playwright. No new dependencies, API contracts, migrations or shared database changes.

## Tasks

- [x] Add failing tests for sequential append, duplicate IDs, concurrency, retry, terminal pages and stale responses after unmount.
- [x] Implement the shared hook and accessible observer/Load more control; keep already loaded items on errors.
- [x] Connect Explore with a public server action and Recommended with an authenticated action; reuse the same normalized recommendation query builder for initial and subsequent requests. Keep Saved/Applied behavior and the selected detail panel.
- [x] Replace page links; update route fixtures to verify filter preservation and removal of pagination controls.
- [x] Verify full tests, lint, typecheck, build and real browser scrolling/search reset/error retry on desktop and mobile; request an independent review of this change.

## Verification

308 frontend tests passed; ESLint and typecheck passed; production build passed with Webpack (the established workaround for Turbopack's restricted-port failure in this environment). Browser checks on Explore at 1440 and 390 px confirmed automatic 12-to-24 append, preserved order and search reset. Simulated transport failure kept the first 12 results and retry appended the next 12. A nested scrollable main element also loaded 24 results. axe WCAG checks reported no violations in the exercised continuation state. The authenticated continuation was covered by account/filter tests, not a real user session.

Independent review found duplicate-only pages could prematurely stop loading after ingestion inserts. Ruling: advance through nonempty duplicate-only pages until the raw page is empty or its reported total is reached; retain the 10,000-page cap. The new regression failed before the fix and passed after; reviewer confirmed no remaining concrete findings.

## Review focus

Slow responses from old filters; repeated observer callbacks; overlapping pages; short/empty terminal pages; failures and retry; per-user recommendation ownership; scrolling inside the workspace main element; selection/save after appending.
