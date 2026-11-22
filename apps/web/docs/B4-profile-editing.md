# B4 Step 2: backend-backed profile editing

Implemented on feature/bianca-profile-resume-hub, based on the complete B3 commit 7392bf3. The original sidebar, opportunities, styling, auth, onboarding, recovery and skills flow remain. No backend, migration, hosted-setting, dependency or environment-file changes are required.

## Data and save behavior

The authenticated account loader reads GET /api/v1/profile and checks profile ownership. The frontend Profile contract now includes the backend's headline, bio, resume_url and timestamps as well as the existing study/location fields. Resume data is not displayed, edited or submitted in this step.

The page displays headline, bio, degree level, university, field of study, graduation year and location, with Not provided for empty/null values. Skills still use GET /api/v1/profile/skills and the existing Manage skills link to onboarding editing; no skills autocomplete or persistence changes were introduced.

Edit profile opens a controlled form. Save compares against the displayed baseline and submits only changed editable fields. The server authenticates again, validates/whitelists the patch and uses PATCH /api/v1/profile, never PUT. Untouched fields, identity, skills and resume are excluded. A concurrent change to an unrelated field is not overwritten by the old displayed value.

Blank changed fields deliberately become null. Supported degree values are bachelor/master/null; graduation year is an integer from 1900 through 2100 or null; headline, university, field of study and location allow up to 255 characters. Bio has no invented length cap. Cancel makes no write and restores persisted values. Save prevents duplicate submissions; failed requests keep edits and show retry guidance. Successful saves show the backend response and revalidate /profile and /jobs. Subsequent match requests read current persisted data; headline/bio are explicitly not claimed to affect matching.

The shared workspace layout still verifies identity/ownership but delegates completion checks to data pages. Profile uses requireAccount so nullable clearing does not trap the user outside the editor. Jobs, Applications and Settings retain requireCompletedAccount. Clearing study/location fields can therefore require the existing onboarding flow before returning to those pages; the form explains this. This is not a new Profile Completion feature.

## Verification

Commands from apps/web:

    node --test tests/auth.test.mjs tests/recovery.test.mjs tests/profile.test.mjs
    npm run lint
    npm run typecheck
    npm run build
    git diff --check

Focused suites: 29 passed. Lint and typecheck passed. The isolated loopback browser suite tests/browser-profile.mjs passed: Not provided, Cancel/no write, headline-only PATCH, skills preservation, failed-save retention, retry, duplicate prevention, validation without a write, explicit null clearing, refresh persistence, completion guards and 320px layout with 24px rounded controls. Synthetic desktop/mobile screenshots were visually inspected. No hosted accounts, profile writes or password operations were used by these automated checks.

The browser suite requires the existing tests/local-services.mjs on loopback 8300/8301, a frontend built and started on 127.0.0.1:3102 with synthetic public URL/key/API process variables, and a dedicated extension-free Edge/Chromium CDP profile on loopback 9338. The fixtures now return the full backend profile shape, can seed synthetic skills and can simulate delayed/failed writes. No application imports them or bypasses authentication. Never deploy these fixtures or run them against hosted services.

A synthetic-config production build was used only for browser verification. After stopping the test frontend, the normal production build is restored with the existing ignored local configuration. Pre-existing uncommitted files are preserved; next-env.d.ts is restored to its pre-task bytes after the checks. Nothing is staged, committed or pushed.

## Manual verification on an approved test account (pending)

1. Start the normal frontend and existing configured backend. Sign in and open Resume / Profile. Compare the seven displayed values with the authenticated profile response; missing headline/bio should show Not provided. Existing skill badges should remain visible.
2. Choose Edit profile. Change headline/bio and one study field, then Cancel. Reopen the form and refresh: discarded changes must not appear, and no PATCH should have been sent.
3. Change only headline and Save. In browser DevTools Network, the Server Action carries the changed-field object; the backend request is server-side, so inspect a local debugger/test transport if verifying its PATCH body. Only headline should change. Confirm success, refresh persistence, unchanged skills and unchanged other fields.
4. Try an invalid graduation year and verify field feedback/no save. Clear bio and Save: it should show Not provided and remain empty after refresh. Clear a study field on a disposable test profile: Profile must stay editable; Jobs must return to existing onboarding. Restore the field before continuing.
5. While editing, set the browser Network panel offline before Save. Confirm actionable failure feedback and retained values. Go online and retry. Double-submit during a slow request: Save/Cancel should disable and only one PATCH should occur.
6. Open Jobs after a successful study/location edit, or refresh it in another tab: new match requests should use persisted data. Scores need not change, and headline/bio do not affect current scoring.
7. Review desktop and a 320px mobile viewport, keyboard entry/focus, field labels, validation alerts, loading/saving/success feedback and vertical scrolling. Test Manage skills through the existing onboarding flow. Signed-out direct access must still redirect to sign-in.

Real-service manual checks above are not marked passed by the synthetic browser suite.
