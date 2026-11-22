# B4 Profile Skills drawer

Presentation-only change on feature/bianca-profile-resume-hub. No new backend requirements, catalog edits or database writes.

## Behavior

The Profile Skills card shows a confirmed count, removable chips, Add skills and the existing refresh/error/retry controls. No catalog/search is visible inline. Unknown selected data is labelled unavailable, never zero.

Add skills opens the existing native modal Drawer primitive configured for a right-side 460px panel at desktop widths and full width below 640px. The underlying Profile card remains visible where viewport space permits. Native showModal handles focus containment/inert background; the primitive locks body scrolling, supports Escape, and restores the original trigger. The trigger stays focusable during mutations so closing an in-flight request can restore focus correctly. Close is labelled and uses a multiplication-sign icon; Done only closes.

Header/footer do not participate in normal catalog scrolling. The picker uses a fixed flex search area and a separately scrolling catalog. At very short viewport heights (400px or less), the body can scroll as an accessibility fallback so its search/content remains reachable; footer remains outside the body. This needs actual mobile/high-zoom verification.

## Catalog and saving

Profile uses explicit mode="drawer". Source categories initially collapse. Query matching reveals matching groups; clearing search restores browse collapse choices. Show more/fewer remains available. Already-confirmed matches stay visible with a check, an added label and disabled addition; they are skipped by arrow selection. There is no duplicated selected-chip list inside the panel.

The unchanged local discovery adapter/live catalog feed all nine source categories plus Other skills. Its new includeSelected option defaults false, preserving the Projects inline picker. Existing canonical/alias discovery and custom-name additions remain. No database IDs are generated for proposals and no matching behavior changes.

Adds call the existing real single-skill action immediately. No batch is saved by Done. The parent ProfileSkills component owns pending/result state; the drawer keeps its picker mounted after close. Confirmed responses update main chips/count and completion callbacks even if closed. Failures retain the query, preserve the prior confirmed list and expose Retry in the panel or original main-card retry outside it. A completed request must not focus a hidden input or reopen the panel.

In drawer mode successful additions preserve query. Projects retains its inline defaults (expanded browsing, selected exclusion, query clearing after adding draft technologies, and Escape closes suggestions without cancelling a project). Existing Drawer consumers retain default size/scroll/unmount behavior.

## Source changes

- ProfileSkills: compact card, drawer controls, feedback and original mutation ownership.
- Drawer: optional skills size, persistent children and footer; existing defaults retained.
- GroupedSkillPicker: explicit drawer mode, collapsed browse, checked results, fixed-search/scroll layout, query/focus handling.
- skill-discovery: optional includeSelected result metadata; no catalog content changes.
- Tests: new skills-drawer.test.mjs; existing component fixtures now inject the primitive.
- This document supersedes the previous inline Profile layout description in B4-grouped-skills-handoff.md. Its catalog/backend handoff remains applicable.

## Automated checks and limits

node --test tests/*.test.mjs: 90 passed, including four focused drawer cases. These cover opening/closing, in-flight close reconciliation, confirmed count/chips, failed-add retry, grouped alias search, selection checks, query retention and default inline picker regressions. A controlled native-dialog contract test executes showModal/close, scroll-lock restoration, trigger focus restoration, Escape callback and responsive size configuration.

npm run lint, npm run typecheck, npm run build and git diff --check passed; new-file whitespace checks passed. Existing Projects, Experience, auth, onboarding, profile/completion, Resume and matching regressions run in the same suite.

Component tests use controlled hooks/dialog objects. They do not prove actual browser focus containment, screen-reader behavior, desktop/mobile sizing or high-zoom rendering. No real-service manual checks for this presentation are marked passed.

## Exact manual checks (pending)

1. Sign in, open Profile and locate Skills. Compare the confirmed count/chips with the saved list; no inline catalog should remain.
2. Select Add skills. On desktop verify right-side sizing and background visibility; on a narrow phone verify full-screen. Check all nine categories start collapsed, then expand and Show more/fewer.
3. Search JS or another alias. Verify only matching groups reveal. Arrow through selectable options, Enter to add, and Tab to category/custom/close controls. Confirm added results show a check and cannot be added again. Main chips/count change only on confirmed success.
4. Preserve a search while adding multiple skills; confirm the query remains. Add a custom skill and check Other skills behavior. Remove a main-card chip and check count/results reconcile.
5. Throttle the connection, submit an add, then close with Done or the close icon before it resolves. Confirm Add skills regains focus, the result later updates main chips/count without reopening or focusing hidden content, and reopening shows the checked result. Done must not trigger another write.
6. Simulate an offline request, check no fake success/count increase, restore connectivity, and Retry. Verify the query and previous confirmed list remain until reconciliation.
7. Close via the close icon, Escape from the search field and Done; each must restore focus and background scroll. Tab/Shift+Tab while open must remain inside the native dialog.
8. Test 320px width, landscape/short height and 200%-400% zoom: search, errors, catalog choices and footer remain reachable without horizontal clipping. Check the short-height fallback.
9. Verify Projects technology picking and current onboarding skills behavior are unchanged, along with existing Profile/Resume and Jobs navigation.
