# Profile document layout implementation plan

**Goal:** Adapt the profile to the supplied CV-style reference using existing persisted fields and editing flows.

**Approach:** A continuous document column contains introduction, education, experience, skills, other existing collections and preference summaries. A desktop sidebar contains completion and private resume controls. On mobile these become one scrollable document. Keep the brand tokens; add no schema, dependencies, contact fields or sensitive demographic questions.

## Tasks

- [x] Add a regression test proving education opens the existing editor and Cancel preserves saved information.
- [x] Split the editor's read view into profile overview and education; display the verified account email when supplied by the guarded route.
- [x] Reorganize ProfileHub and replace the old short-screen/nested-scroll stylesheet with document sections and a structural experience timeline. Preserve services, mutation callbacks and completion handling.
- [x] Show saved preference summaries with an expandable edit form; retain all existing controls and server actions.
- [x] Verify unit tests, responsive browser rendering with explicitly fictional data, keyboard edit/Cancel, preferences disclosure, axe, lint, typecheck and build. No commits or pushes requested.

## Results

309 frontend tests passed. All four isolated Playwright tests passed on desktop/mobile, including account signup/session, persisted preferences/PDF/project changes, tracking, and two-user access denial. Browser profile checks at 1440x1000, 1024x700, 390x844 and 320x700 found no horizontal overflow, JavaScript errors or violations in the exercised WCAG axe rules; Education focuses University, Cancel preserves the saved summary and preference disclosure works. Screenshots use explicitly fictional profiles and intercepted local collections. Independent profile review reported no actionable findings. ESLint, typecheck and production Webpack build passed. Local frontend restarted on port 3000 and verified HTTP 200.

Ruling: the full E2E run exposed an earlier detail-layout regression on short desktop panes: match summary pushed tracking controls outside the visible region. Move the existing controls to the beginning of the header, preserving their state and forms. The original failing viewport assertion now passes without weakening the test.
