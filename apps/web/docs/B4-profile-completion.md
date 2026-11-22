# B4 Step 4: Profile Completion

Implemented locally on feature/bianca-profile-resume-hub in the original complete worktree.
Status: ready for manual verification/review; no commit or push.

## Formula and persisted data

lib/profile-completion.ts exports the pure profileCompletion helper. The eight items are headline, bio, degree_level, university, field_of_study, graduation_year, location, and at least one saved skill. Percentage is Math.round(completed / 8 * 100), giving 0, 13, 25, 38, 50, 63, 75, 88 or 100 percent.

Null/empty/whitespace-only text is missing. Backend-compatible validation requires the bachelor/master enum, whole graduation years 1900-2100, the existing 255-character limits on short text, and a nonblank persisted skill with an ID and a name up to 100 characters. Bio follows the existing contract without an invented length cap. One or many saved skills count as one item. resume_url is ignored.

Unknown profile or selected-skills snapshots return null rather than a percentage. The card then displays an unavailable/retry state. The workspace's existing account-problem/retry screen still handles an initial complete profile-load/authentication failure; no fabricated profile or zero-percent card bypasses that boundary.

## UI and update flow

ProfileHub owns the confirmed snapshots used by the top-of-page card. The existing editor and skills components publish confirmed results through optional callbacks. Draft typing and Cancel never publish a completion update. Failed server saves/skill confirmations mark the affected completion data unknown rather than increasing the count. Skill suggestions/catalog failures do not invalidate otherwise confirmed selected skills.

The card has a labelled native progress indicator, percent, X of 8 count, an eight-item checklist and expandable formula help. Editor actions open the existing form and focus the requested field; the skills action scrolls/focuses the existing Skills controls. Already-open edits are preserved. Styling uses the existing rounded semantic dark-theme controls with a responsive one/two-column checklist.

Retry reads the verified account/profile and authenticated selected-skills endpoint; no new backend route exists. It preserves unsaved editor drafts. Confirmed retry skills are passed to the existing skills display. An older completion refresh cannot overwrite a newer confirmed save/mutation. The card is profile completeness only, not a match score or eligibility guarantee, including at 100%.

## Matching explanation checked against backend

- degree_level: structured degree eligibility comparison when the opportunity specifies a requirement.
- field_of_study: field-fit scoring from opportunity text.
- location: location scoring and conservative location checks; free-text mismatch alone does not establish ineligibility.
- skills: deterministic skill overlap, with the existing phrase/alias limitations documented in the catalog proposal.
- headline, bio, university and graduation_year: do not improve current scoring or eligibility gates. Graduation data is passed through matching input but is excluded from current gates; passing a field is not evidence that it contributes to ranking.

Sources: apps/api/src/opportunity_api/matching/scoring.py, matching/engine.py, eligibility/rules.py and api/opportunities.py. Matching behavior is unchanged.

## Verification actually run

- node --test tests/auth.test.mjs tests/recovery.test.mjs tests/profile.test.mjs tests/profile-skills.test.mjs tests/skills-autocomplete.test.mjs tests/profile-completion.test.mjs: 56 passed.
- Eleven new completion tests cover empty/partial/full profiles, whitespace and invalid values, every rounding outcome, skill quantity, resume exclusion, confirmed save/add/remove, failed saves, Cancel, unavailable data/retry, a stale refresh race, checklist actions and progress semantics.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed on unchanged retry. The first invocation compiled/generated pages but exited with Next.js SecurityFatalError and an upgrade recommendation. The retry completed with a known-vulnerability warning. No dependencies or security controls were changed; the warning needs a separately scoped dependency review.
- git diff --check plus new-file whitespace checks: passed.

The integration tests use controlled transport/hook scheduling and a component render-tree harness, not actual browser layout or live Supabase. Real-service, keyboard-focus-in-browser and mobile/desktop visual checks have not been confirmed. Earlier B3/B4 manual results do not count as confirmation for this card.

## Manual checklist (pending)

1. Open Profile using the real backend. Compare all eight items with saved API data. Confirm one item = 13%, seven = 88%, eight = 100%; a resume must not alter the result.
2. Follow each checklist action with the keyboard. Verify the correct editor field or Skills control receives focus, and an existing draft is preserved. Check help, native progress label, focus visibility, desktop and narrow mobile wrapping.
3. Type without saving, then Cancel: completion must remain unchanged. Save successfully: only the confirmed result changes completion. Clear nullable text and remove the last skill: completion must decrease after confirmation.
4. Simulate profile/selected-skills failures: unavailable/retry instead of zero or a misleading percentage. Recover and retry; verify refreshed completion and preserved drafts. A suggestions-only failure must not erase confirmed completion.
5. Confirm 100% says all eight items are saved while retaining the match-score/eligibility disclaimer. Verify profile editing, skills, onboarding, protected navigation, sign-in/out and recovery still work.

## Scope

New files: lib/profile-completion.ts, components/profile/profile-completion.tsx, components/profile/profile-hub.tsx, profile/completion-actions.ts, tests/profile-completion.test.mjs and this document.
Existing files extended: profile/page.tsx, components/profile/profile-editor.tsx and components/profile/profile-skills.tsx.
Catalog/importer, backend, onboarding, environment, dependency and unrelated local work remain unchanged.
