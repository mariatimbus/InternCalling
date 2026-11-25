# Workspace polish implementation plan

**Goal:** Make the whole student workspace attractive, easy to scan and consistent with the user's supplied LinkedIn-style profile and job references.

**Architecture:** Refine the existing light interface through shared tokens, controls and layout; retain existing routes, data, auth and mutation behavior. Continue the established brand rather than introducing a new palette or design dependency.

**Direction:** Warm-white document surfaces on a quieter blue-tinted ground, clear navy headings, violet supporting text, electric-blue actions. Visible company marks and grouped job facts; a consistent document hierarchy for profile sections; the same control, heading and spacing vocabulary on applications, resumes, settings and authentication. Mobile layouts wrap and collapse structurally. No gradients, heavy shadows, decorative animation or invented facts.

**Tech stack:** Existing Next.js, React, Tailwind, CSS Modules and outline SVG icons.

- [x] Inspect rendered public/auth pages and signed-in fixture flows before editing.
- [x] Refine shared typography, controls, navigation and page headings in `apps/web/src/app/globals.css` and `src/components/{ui,layout,navigation}`.
- [x] Apply the same hierarchy to Jobs/search/cards/detail, Profile, Resumes, Applications and Settings; refine public entry and authentication pages.
- [x] Run the existing unit tests, ESLint, typecheck and production build; inspect desktop and mobile browser screenshots, keyboard navigation, overflow, contrast and empty states through the existing disposable E2E setup.
- [x] Update DESIGN.md to match the shipped interface, inspect the complete diff, scan secrets/history and commit/push as biancanan on `feature/bianca-workspace-polish`.

**Review focus:** Long titles and filenames must wrap safely; selected jobs must remain identifiable; mobile navigation and filter dialogs must remain keyboard accessible; editing controls must retain labels and errors; no profile facts or resume content may leak into screenshots or commits (use fixture data).

## Verification and review

- 332 frontend unit tests passed. ESLint, Next.js typecheck and production build passed.
- All six core/project browser flows passed on desktop/mobile. The combined eight-test run was interrupted after seven passes; the two full-route accessibility tests then passed separately.
- Reviewed rendered public, auth, Jobs, profile, resumes, applications and settings screenshots on desktop/mobile. Long job titles fit at 768, 1024 and 1440 pixels; route checks found no horizontal overflow or WCAG A/AA violations.
- Independent review identified a lost long-title wrap rule; corrected and covered by the browser check. Added the missing accessible role on the match score indicator.
- No dependencies, API contracts, hosted data or infrastructure changed. Security scan and feature-branch push are recorded in the task completion report.
