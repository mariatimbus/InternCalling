# B3: authentication and onboarding

## Routes and boundaries

- `/sign-up` and `/sign-in` expose Supabase Auth email/password, Google and LinkedIn OAuth through Server Actions. Apple remains supported internally but is hidden because it is not configured. Google and LinkedIn use the same session, profile and onboarding guards; see [Google sign-in setup](google-sign-in.md).
- `/forgot-password`, `/auth/recovery/callback` and `/reset-password` implement isolated SSR/PKCE password recovery. See [password recovery](password-recovery.md) for trusted origins, verified recovery claims, redirect allowlists and email-template setup.
- `/auth/callback` exchanges the email confirmation PKCE code. Success always goes to `/jobs`; arbitrary redirect destinations are not accepted.
- `/onboarding` asks one question per screen, then reviews the answers. Degree level, university, field of study, graduation year and location are required. Skills are optional. Back preserves the in-memory draft; Skip is available only for skills. Refresh discards unsubmitted edits.
- `/jobs`, `/profile`, `/applications` and `/settings` share the authenticated AppShell. Server layouts and data entry points verify identity and persisted profile completion before returning private content. These routes render dynamically even when configuration is missing at build time.
- `/explore` and the home page display actual API records. Legacy `/preview/**` routes redirect to real pages; no fictional workspace is exposed.

The user identity is verified with `supabase.auth.getUser()`. Cookie session user data and editable user metadata never authorize a request. `proxy.ts` refreshes provider cookies before rendering, preserving all cookie chunks and no-store headers on redirects. The browser SDK keeps cookies synchronized and handles cross-tab auth events. A client boundary conceals stale private content after sign-out, an identity change or a browser history restoration; it does not replace server verification.

## Configuration

Configure these public values in the deployment environment or an ignored local environment file:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS project URL; HTTP is accepted only for loopback development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy anon-key fallback, if no publishable key is set |
| `NEXT_PUBLIC_API_BASE_URL` | FastAPI origin, without `/api/v1` |

Never put a service-role key, secret key or custom signing secret in a public variable. The public configuration validator rejects privileged keys. Missing auth configuration disables authentication with a setup message. The public catalog requires the API configuration. Invalid configuration fails closed. Do not copy another developer's secret files into a worktree.

Configure Supabase's Site URL and redirect allowlist for the app's actual origin, including `/auth/callback`. When email confirmation is enabled, use Supabase's PKCE-compatible confirmation link (`ConfirmationURL`, delivering an authorization code to the callback); the app displays a check-email state until confirmation. Open the link in the browser where registration began so the PKCE verifier cookie is available. If confirmation has already succeeded but the verifier is unavailable, return to sign-in. Configure password strength and email delivery in Supabase, not in a second frontend auth system.

See the official [Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs) and [password authentication guide](https://supabase.com/docs/guides/auth/passwords).

## API integration

`src/lib/api/client.ts` is the single bearer-token transport: approved same-origin API paths, no-store reads, JSON requests, a 15-second timeout and no credential-forwarding redirects. It uses the verified Supabase client's current access token; the SDK owns session refresh. Backend authorization remains authoritative.

Completion is derived from the five persisted profile fields, without a new metadata flag or schema change. The frontend verifies that `profile.user_id` matches the verified provider identity. `finishOnboarding` whitelists and validates fields, writes skills using `PUT /profile/skills`, then writes required fields using `PATCH /profile`. PATCH preserves unrelated existing profile fields. A failed final write leaves a new user's profile incomplete and retryable. These two endpoints are not transactional: skills may already be saved after a partial failure. Retrying replaces them idempotently. Existing complete users can edit through `/onboarding?edit=1`.

The Recommended page fetches up to 12 active opportunities, optionally filtered by type and their existing per-opportunity match endpoints. Ranking is within that page, not a global recommendation query. Failed match requests show unavailable scores while keeping the listing usable. Compensation, work mode and duration are hidden when the API does not provide them. No salary or sponsorship preferences are invented. Saved and Applied links read the application's existing records; creating and updating application records is outside B3.

No backend endpoints or migration files were changed. After explicit user approval, the five existing migrations were applied to the configured Supabase project, creating the application tables, existing RLS policies and Auth synchronization. This target is separate from the team's documented shared project. See [verification results](B3-verification.md) for scope and remaining checks.

## Local verification

From `apps/web`:

```sh
npm run lint
npm run typecheck
node --test tests/auth.test.mjs tests/recovery.test.mjs
npm run build
```

`tests/local-services.mjs` provides isolated Supabase-protocol and FastAPI doubles on loopback ports 8301 and 8300. They use ephemeral synthetic identities and test tokens and must never be deployed. No application code imports the doubles and there is no test-auth bypass flag in the application.

To run the browser suite:

1. Start `node tests/local-services.mjs` in one terminal.
2. In a second terminal, set public URL to `http://127.0.0.1:8301`, public key to a synthetic `sb_publishable_` test value and API origin to `http://127.0.0.1:8300`. Build with those test values using `npm run build`, then start with `npm run start -- --hostname 127.0.0.1 --port 3102`. Public environment values must be isolated at build time as well as at runtime; do not use a build compiled with real project settings for the protocol-double suite. Stop the real local frontend during this build, then restore a build using real configuration before restarting it.
3. Launch a separate headless Chromium/Edge profile with `--remote-debugging-port=9224` and `--no-first-run`. Keep its debugging port local.
4. Run `node tests/browser-auth.mjs`. It controls only that dedicated profile, resets the local test doubles and writes screenshots into the system temporary directory under `interncalling-b3-review`.

The isolated browser suite tests frontend integration, cookie handling, redirects, failure states and per-user profile checks. It does **not** validate hosted services. Separately, the versioned RLS/Auth suite was historically run on the user-approved real project with two temporary fixtures that were rolled back. On 16 November the user confirmed real Google/LinkedIn sign-in and refresh persistence, recovery email/callback, mismatch rejection, successful reset/new-password sign-in and old-password rejection. Current automated results and remaining manual checks are distinguished in [B3 verification](B3-verification.md); these confirmations do not establish every signup, onboarding or isolation scenario.

## Review context

This branch publishes the complete original InternCalling interface from InternCalling-B3, including required B2 design/navigation dependencies and B3 auth/onboarding/recovery. It is not the temporary minimal candidate. See [Maria review notes](review-for-maria.md) for fresh checks, user-confirmed observations, excluded local work and the newer unmerged origin/develop commits. No backend, schema or hosted changes are part of this review.
