# B4 Step 5: Resume link

Implemented locally on feature/bianca-profile-resume-hub in the original complete application.
Status: ready for manual verification/review. No commit or push.

## Behavior and contract

ResumeEditor loads its initial value from the authenticated profile already fetched by the Profile page. Missing/null/whitespace-only values show "No resume link added". A valid saved URL shows "Resume link added" and "Open resume" with target="_blank" and rel="noopener noreferrer". This does not certify file availability.

Users can add or replace a link. Remove link opens the existing editor with an empty value; Save confirms removal and sends null, while Cancel restores the saved link. Controls are disabled during saving and an immediate in-flight guard prevents duplicate requests. Failed saves retain the entered value and previous confirmed link. Successful saves display the validated backend response; /profile is revalidated and a fresh page load reads the persisted backend profile.

saveResumeLink is a separate authenticated Server Action so the existing seven-field profile editor remains narrowly scoped. It only sends:
- PATCH /api/v1/profile with {resume_url: validatedUrl}
- Removal: PATCH /api/v1/profile with {resume_url: null}

No PUT, unrelated profile fields, skills writes, matching calls, new API endpoint or backend changes. Unchanged values avoid a duplicate PATCH. The response must match the verified user's profile ID/user ID and the existing profile shape before it is shown as confirmed.

## Validation and safe legacy handling

lib/resume-link.ts provides shared pure syntax validation for the UI, Server Action and saved-link rendering:
- absolute http:// or https:// with a valid host;
- trimmed surrounding whitespace; empty/null means removal;
- no embedded credentials, including an empty userinfo delimiter;
- no control characters, internal spaces, or backslashes that could cause parser ambiguity;
- at most 512 characters, matching the backend limit conservatively.

Invalid legacy values are not rendered as anchors or exposed as a saved clickable URL. The section offers replacement/removal; the value is editable for correction. Validation never fetches the destination, checks a file, makes a HEAD request, parses a document or claims access. A signed/expiring hosting URL can expire after saving. Access permissions remain the hosting service's responsibility.

The future area is informational text only: upload, parsing and tailoring are "Not available yet". There are no fake upload controls, simulated analysis or AI results. The current link is not used in matching. Profile Completion's eight-item formula/helper remain unchanged.

## Changed files

New:
- src/lib/resume-link.ts
- src/app/(workspace)/profile/resume-actions.ts
- src/components/profile/resume-editor.tsx
- tests/resume-link.test.mjs
- docs/B4-resume-link.md

Extended:
- src/components/profile/profile-hub.tsx: mounts the independent Resume section after Skills.
- tests/profile-completion.test.mjs: adds the new child component to the existing test fixture; completion assertions/formula are unchanged.

Catalog/importer, backend, environment, dependencies and unrelated work are preserved. No data/schema/hosted writes were performed.

## Actual checks

- node --test tests/auth.test.mjs tests/recovery.test.mjs tests/profile.test.mjs tests/profile-skills.test.mjs tests/skills-autocomplete.test.mjs tests/profile-completion.test.mjs tests/resume-link.test.mjs: 65 passed.
- Nine new Resume tests cover URL boundaries/schemes/credentials, partial PATCH, replacement/removal, persisted response validation, unchanged writes, safe errors, Cancel, draft retention, pending/duplicate submissions, remount persistence and safe rendered links.
- Safe-link tests include actual React server rendering; interaction tests use controlled action responses and a hook/render-tree harness. They do not prove live service persistence or actual browser focus/layout.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed on unchanged retry; the initial invocation compiled/generated pages but exited with Next.js SecurityFatalError. The retry continued with the existing known-vulnerability upgrade warning. No dependencies or security controls were changed. A separate dependency/security review remains necessary.
- git diff --check and new-file whitespace checks: passed.

Real-service manual checks remain pending; earlier B3/B4 confirmations do not confirm this Resume section.

## Manual checklist (pending)

1. Sign in with the real backend and open Profile. Verify an absent link shows the exact empty message. Add a valid hosting URL and Save; verify PATCH contains only resume_url, reload and confirm persistence.
2. Replace the URL; Cancel an edit and confirm it restores the previous link. Remove and Save; verify explicit null, then reload to confirm removal. Other profile values and saved skills must remain unchanged.
3. Reject relative/javascript/data URLs, embedded credentials and overlong input. For an existing unsafe legacy value, verify no Open resume link appears and replacement/removal remain usable.
4. Simulate an API failure: draft remains, error is actionable, retry succeeds. Check disabled pending controls and no duplicate PATCH on repeated submission.
5. Open a valid saved link in a new tab; verify hosting permissions separately. The UI must not claim the file is accessible, uploaded, parsed, analyzed or used for matching.
6. Check keyboard focus, announcements, long-URL editing and narrow mobile/desktop layout. Confirm Resume changes do not affect the completion percentage or existing profile/skills/authentication/onboarding/recovery flows.
