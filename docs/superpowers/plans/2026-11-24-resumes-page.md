# Dedicated resumes page implementation plan

> **For agentic workers:** Use executing-plans to implement this plan task by task.

**Goal:** Remove PDF upload and parsing from Profile and move resume management into an authenticated Resumes page based on the supplied table reference.

**Architecture:** Reuse the existing private-PDF service and ResumePdfController. Profile retains its completion, preferences and manual editors. The new page shows actual confirmed metadata and native row actions; upload and replacement open an inline form. Preserve parsing/review on the resume page when available.

**Constraints:** Existing API supports one active PDF, without a target-job-title or multi-resume slot contract. Display the real saved count and unavailable target title honestly. Do not invent a five-slot backend, persist documents in browser storage, modify Supabase or delete existing files during the move. Keep the existing light blue/navy design system. Continue the existing task branch without committing or pushing.

- [x] Add regression coverage for Profile without PDF/review controls and the authenticated resume library.
- [x] Remove Profile's upload/parsing state; add Resumes navigation and authenticated route/proxy coverage.
- [x] Build the responsive resume table, empty/error/loading states, private access, replacement/deletion and optional parsing using the current controller.
- [x] Move E2E PDF checks to Resumes and verify Profile has no file picker; test persistence and mobile/desktop layout.
- [x] Run unit tests, typecheck, lint and production build; capture the page and request the required finish review.

**Design:** Operate surface within the established design system. Header: Resumes and an Add/Replace action; saved count above a single warm-white table. Columns: Resume, Target job title, Last modified, Created, row menu. On small screens keep the filename, uploaded date and actions visible. No fabricated filenames, analysis badges, slot limits or target titles.

## Verification

317 frontend unit tests passed; typecheck and ESLint passed. All four desktop/mobile E2E tests passed, including guest redirection, mobile navigation, no Profile file picker, upload/refresh, private view, replacement with a new persisted identity and deletion. Saved-state Axe checks and overflow checks passed in both browsers. Webpack production build passed. Backend tests were not repeated because backend implementation is unchanged; E2E uses the real API with isolated fixtures and private-storage test transport.

Fresh impeccable finish review inspected four saved/empty desktop/mobile captures and the implementation and returned `ship`, with no material fixes. Screenshots are in `.impeccable/review/resumes/`. DESIGN.md's Profile and Resume Library guidance and apps/web/docs/resumes-page.md document the move and current API limits. No commit, push, PR, database migration or shared data change was performed.
