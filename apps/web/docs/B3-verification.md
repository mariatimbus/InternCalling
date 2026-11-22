# B3 verification

## Original full-interface publication for Maria

The current publication preserves the complete original interface, including B2 dependencies. It supersedes the earlier plan to extract a minimal candidate. See [fresh original-version results and review scope](review-for-maria.md) for this publication's actual tests, browser screenshots, security/dependency notes and pending checks. Temporary-candidate results are not used as evidence.

## Current verification record â€” 16 November 2026

This section supersedes older statements below about disabled Google/LinkedIn providers, missing recovery verification and tooling blockers. Older sections are dated implementation history, not the current acceptance record. No credentials or test-account details are recorded here.

### Automated results observed by the agent

On the full current worktree, before the documentation-only commit-scope review:

| Command, from `apps/web` | Actual result |
| --- | --- |
| `node --test tests/auth.test.mjs tests/recovery.test.mjs` | 20 passed, 0 failed |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; auth, recovery and protected routes are dynamic |
| `git diff --check` | Passed |

Node 24.22.0 and npm 11.19.1 work in the user's normal PowerShell. The agent's restricted environment produced NVM4306 and later a missing active-version result; the same normal NVM-managed commands passed outside that sandbox. No npm entrypoint, NVM trust rule or toolchain configuration was changed. These results apply to the full mixed worktree, not yet to an extracted B3 commit.

The last credential-pattern scan covered 251 tracked/non-ignored text files. Matches were configuration placeholders and ingestion-test fixtures; no suspected live credential was identified. Local `.env` and web `.env.local` are ignored, while only `.env.example` templates are tracked. This is a pattern scan, not a comprehensive secret guarantee. Dependency-audit results below are historical and were not rerun in this verification pass.

### User-confirmed manual results

The user explicitly confirmed the following in this conversation on 16 November 2026; these are user observations, not a fresh agent-operated browser run:

- Google and LinkedIn sign-in work, including session persistence after refresh.
- A recovery email is delivered and its callback reaches the reset form.
- Mismatching passwords are rejected.
- Password reset succeeds and sign-in accepts the new password.
- Sign-in rejects the old password.

Apple is intentionally hidden on both auth pages because it is not configured. Underlying provider recognition remains supported; Apple consent is not a release requirement for the current UI.

### Still pending / not established by those confirmations

- The former minimal-extraction plan is superseded by the user's request to publish the full original interface. Fresh original-version checks are in review-for-maria.md; target integration and human review remain pending.
- Re-run the updated browser automation; its older results below predate recovery and Apple-button removal.
- Current real email/password signup and confirmation, onboarding persistence and both complete/incomplete profile paths.
- Current real two-user isolation, forbidden cross-user access, sign-out across tabs/history, expired/revoked sessions and network/rate-limit behavior. Historical isolated/RLS results below are separate evidence.
- Real expired, invalid, reused and wrong-browser recovery links; hosted password-policy rejection. Focused tests cover simulated failures but do not replace these hosted checks.
- Current mobile/desktop and keyboard/screen-reader review, with PR screenshots for the final scope.
- Deployment-specific trusted origin, redirect allowlist and recovery email-template review; local success does not prove production configuration.
- B2 prerequisite ownership/integration, current target-branch freshness, Notion task/acceptance mapping, dependency audit before push, human review and merge. This work is not marked Done.

## Historical record â€” 4 November 2026 and subsequent implementation notes

Verified on 4 November 2026 in the `InternCalling-B3` worktree using Node.js 24.22.0 and a dedicated headless Edge profile. The browser integration suite uses loopback protocol doubles. After the user supplied real configuration and explicitly approved schema initialization, the five existing migrations were also applied to their configured Supabase project. Hosted verification is listed separately below.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, zero warnings |
| `npm run typecheck` | Pass |
| `node --test tests/auth.test.mjs` | 11 tests pass |
| `npm run build` | Pass; authenticated routes are dynamic |
| `node tests/browser-auth.mjs` | Pass with isolated services |
| `git diff --check` | Pass |
| Changed/new text credential-pattern scan | No matching credentials found; credentials remain in ignored local configuration |
| `npm audit --omit=dev --json` | Zero reported vulnerabilities |
| `npm audit --json` | 16 moderate findings in development tooling through ESLint/minimatch; no high or critical findings |

The audit suggests incompatible major version changes to tooling; no forced downgrade or unrelated dependency override was applied. This is an outstanding maintenance item, not a claim that the full dependency audit is clean.

## Browser coverage

- Unauthenticated direct access to each protected route redirects before returning private content; private responses disable caching.
- Invalid credentials and rate limiting display useful, safe messages.
- Sign-up enters onboarding; required questions cannot be skipped; Back retains answers; skill search and selection work.
- A failed final profile write remains retryable and leaves a new profile incomplete. Skills are written first, profile last.
- Successful onboarding opens the Recommended feed. Refresh preserves the session. Completed users skip onboarding.
- Actual API response matches are displayed; failed matches do not fabricate scores; search uses FastAPI's `search` parameter.
- Desktop has persistent navigation and a split pane. A 320px viewport has no horizontal overflow. Mobile detail is a focus-contained dialog.
- A mismatched profile owner fails closed. A second user sees their own profile, without the first user's data.
- API and auth-provider outages show recovery states. Provider recovery retains the existing session.
- Sign-out hides private content in another tab. Browser history cannot restore the signed-out workspace.
- Short-lived sessions refresh through SDK cookies; revoked sessions are rejected.
- Email-confirmation PKCE callback exchanges the code and stays on the original host.
- Without public configuration, the real auth forms show setup information, protected routes redirect, and the public demo remains available.
- Google is a separate form on sign-in and sign-up, so it works without entering an email/password first. The isolated suite passed provider-disabled recovery, network failure, consent cancellation without upstream error disclosure, mobile layout, SDK PKCE cookie exchange, new-user onboarding and returning-user Jobs navigation.

Screenshots were visually reviewed at desktop and mobile sizes. Artifacts are saved under the system temporary directory in `interncalling-b3-review`: sign-up, onboarding, summary, jobs and mobile detail.

## Hosted verification

The user-approved target is `eabtzresfdzekvqpyrrx`, a separate project from the shared team project documented in `supabase/README.md`. The shared team project was not changed.

- The Supabase Auth settings endpoint accepted the supplied public key. Email authentication is enabled and email confirmation is required.
- The hosted JWKS endpoint returns HTTP 200 with an ES256/RS256 key supported by the existing backend verifier. A real user token has not yet been exercised end to end.
- A read-only database connection succeeded over SSL.
- All five existing SQL migrations passed a fresh local PostgreSQL replay, then were applied with the pinned Supabase CLI. The preview listed exactly those five migrations, no seeds and no extra roles. Vault updates were explicitly skipped.
- Remote migration history matches the five local versions. All seven application tables exist and enable RLS.
- The versioned `supabase/tests/rls.sql` suite passed on the approved project: Auth/profile synchronization, two-user isolation, anonymous/catalog permissions and deletion cascades. All synthetic fixtures rolled back; no temporary test accounts remained.
- API health, database health, skills and internship catalog endpoints return HTTP 200. A later explicit user request published 24 reviewed real opportunities; the selection/publication artifacts remain separate local work, outside this frontend PR.
- Auth forms render without missing-configuration messages. Unauthenticated `/jobs` access redirects to sign-in; unauthenticated API profile access returns HTTP 401.

The real frontend is served at `http://localhost:3000`; the API uses port 8000. The historical B2 source is preserved, but its routes now redirect to real pages. Public browser configuration was written to ignored web `.env.local` files; the database password stays in the ignored server `.env`. No privileged key was copied into frontend configuration.

## Remaining release verification

A full browser sign-up with delivered email, confirmation redirect and a real provider-issued user token through FastAPI has **not** been performed. Validate this with an approved test account before release. The callback for the real local app is `http://localhost:3000/auth/callback`; verify the Site URL and redirect allowlist in Supabase. Hosted Auth settings and email delivery configuration were not changed. No new migration files or backend endpoint changes were introduced.

The Google option is implemented through Supabase's existing `signInWithOAuth` provider. The real project reported Google disabled and no Google OAuth credentials were supplied; real Google consent has not been tested. Follow [provider setup](google-sign-in.md) to enable it in Supabase. No Google client secret belongs in frontend configuration.

The original B2 worktree is preserved. B3 is uncommitted on `feature/bianca-auth-onboarding`, based on `origin/develop` at `92426f7`, with B2 UI prerequisites copied into this separate worktree. No push or PR has been created. Review B2 integration and the tooling audit findings before release.

## Real catalog follow-up

The 24-record publication passed a dry run and two hosted imports (24 inserted, then 24 unchanged). No expired records or duplicate URLs were published. Original research files were preserved. Public pages and retired-route redirects use actual API data. Google, Apple and LinkedIn share the verified PKCE callback and account guards; all three passed the isolated browser suite for disabled-provider recovery, cancellation, new-user onboarding and returning-user access. The provider settings endpoint still reported all three disabled during the latest read, despite the user confirming Save; no real provider-consent success is claimed.

`tests/browser-catalog.mjs` passed against the real application and API: actual total, all 24 records across pagination, official source URL membership, search, category filtering, legacy redirects, a 320px layout and the three social buttons. The selected importer/catalog backend suites passed 60 tests (3 existing framework deprecation warnings). Ruff passed for the new source-review and publication scripts. A pattern scan covered 98 changed/new non-environment text files and found no credential patterns. A separate scan comparing source against private `.env` values was refused by automatic approval review and was not run; the completed pattern scan does not read environment files.

Direct authorization-start probes for Google, Apple and LinkedIn OIDC also returned HTTP 400 with provider-not-enabled responses on the configured real project. Those probes did not complete provider consent or create a user account.

## Signup quota recovery

Email quota and request throttling errors now have separate messages without an invented reset time. Sign-up cookie writes commit only after a successful provider response, preserving an earlier email's PKCE verifier after a failed request. The isolated browser suite passed the recovery scenario: send a confirmation, receive a simulated email-quota error on another attempt, then successfully complete the original confirmation link and enter onboarding. The separate request-429 and email-429 UI checks also passed. No real sign-up requests or emails were used for these tests, and no hosted limit or email-confirmation setting was changed. See [Auth rate limits](auth-rate-limits.md) for the provider-side SMTP setup still required for normal email volume.
