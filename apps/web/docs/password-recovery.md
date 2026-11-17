# Password recovery

The sign-in link opens `/forgot-password`. The server calls `resetPasswordForEmail` using the existing public Supabase configuration. Accepted requests always show the same message, including for unknown addresses. Network failures and rate limits have safe, separate messages. Passwords never enter returned action state or logs.

Recovery uses the existing `@supabase/ssr` PKCE architecture in a separate SDK storage namespace (`interncalling-recovery`) with HttpOnly, SameSite=Lax cookies, Secure on HTTPS. Only a successful code exchange whose SDK redirect type is `recovery` is committed to that namespace. There are no custom authentication tokens or privileged credentials. Ordinary application sessions use their existing namespace.

The callback, reset page and update action additionally require Supabase-verified `getClaims()` JWT claims with `amr.method = recovery`, bound to the same user identity. Merely copying a normal password/OAuth session into the recovery cookie namespace cannot satisfy that check. See Supabase's [JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields). JWTs are verified by the SDK, not decoded locally as proof of authorization.

`/auth/recovery/callback` exchanges the code, ignores arbitrary `next` destinations, and redirects only to `/reset-password` or its invalid-link state. Both reset page and password-update action verify the recovery session with Supabase `getUser()`. An ordinary login cookie or query parameter alone does not unlock the form. These routes are outside the workspace/profile/onboarding guards. The proxy refreshes the separate recovery cookies on the reset route and disables caching. Failed recovery requests do not overwrite an earlier PKCE verifier.

Open the email in the same browser and on the same origin used to request it. Missing verifier cookies, expired/used codes and invalid links show a new-email link. A successful exchange consumes the code; refreshing the reset form uses the resulting session. Supabase enforces the project's configured password length, strength and compromised-password rules; the form checks presence, matching values and the existing application's 128-character maximum. Policy rejection remains retryable. Successful updates sign out the recovery session and any ordinary session in this browser before opening sign-in with success feedback. If sign-out fails, a separate button retries sign-out without resubmitting the password.

## Required deployment/dashboard setup (not applied by this change)

1. The server-only `AUTH_APP_ORIGIN` setting is the trusted application origin, with no path, query or credentials. Its local default is exactly `http://localhost:3000`. For a deployment set it to that deployment's HTTPS origin, for example `https://interncalling.example`. Do not derive it from incoming Host/forwarded headers. Request actions reject a different Origin. To use `127.0.0.1` or a different local port, explicitly configure that origin and use it consistently. No environment files were edited by this task.
2. In Supabase **Authentication → URL Configuration**, set Site URL to the actual trusted app origin. Add this exact local Redirect URL:

   ```text
   http://localhost:3000/auth/recovery/callback
   ```

   For the deployment example add exactly:

   ```text
   https://interncalling.example/auth/recovery/callback
   ```

   Replace the example domain with the real `AUTH_APP_ORIGIN`. Keep the existing `/auth/callback` entry for signup/OAuth. Avoid wildcard redirect entries. `/reset-password` is an internal destination after the exchange; it is not the `redirectTo` passed to Supabase and needs no additional allowlist entry for this implementation.
3. In **Authentication → Email Templates → Reset Password**, use the standard provider verification link:

   ```html
   <h2>Reset your password</h2>
   <p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
   <p>If you did not request this, ignore this email.</p>
   ```

   `ConfirmationURL` leads first to **Supabase's** `https://<project-ref>.supabase.co/auth/v1/verify` endpoint, carrying Supabase's recovery verification data and `redirect_to`. Supabase verifies the email link, then redirects with a short-lived authorization `code` to the **application's** `<AUTH_APP_ORIGIN>/auth/recovery/callback`. The application exchanges it using the browser's PKCE verifier. Do not replace `ConfirmationURL` with a bare `RedirectTo`, do not point Supabase's verification endpoint at the app, and do not use a direct `token_hash`/`verifyOtp` template with this code-exchange callback. That is a different supported SSR flow, not the one implemented here. Leave signup and OAuth templates unchanged.
4. Configure working email delivery/SMTP, the desired password policy and recovery expiry in the correct project. Disable email link tracking. Email scanners can consume one-time links; request a fresh link if necessary. No hosted changes have been made.

Official references: [resetPasswordForEmail (supports PKCE)](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [SSR PKCE](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [email template variables and verification links](https://supabase.com/docs/guides/auth/auth-email-templates), [password authentication and recovery](https://supabase.com/docs/guides/auth/passwords).

## Verification

Current evidence (16 November 2026): the full worktree's auth/recovery tests (20 total), lint, typecheck and build passed. The user separately confirmed recovery-email delivery, callback to reset, mismatch rejection, successful reset/new-password sign-in and old-password rejection. Expired/reused/wrong-browser links, hosted policy failures and final accessibility review remain manual checks. See [B3 verification](B3-verification.md). No hosted settings were changed during this documentation review.

From `apps/web`:

```sh
npm run lint
npm run typecheck
node --test tests/auth.test.mjs tests/recovery.test.mjs
npm run build
```

Recovery tests use synthetic data and injected SDK/Next doubles; they do not send mail, create accounts or contact Supabase. They cover fixed routing, rejected exchanges, missing recovery identities, origin checks, matching passwords, policy/rate errors, secret-free responses and sign-out retries. They do not prove real email delivery or cookie persistence in a browser.

Manual checks after setup: request resets for a test account and an unknown address (same accepted UI); open the real email in the requesting browser; verify both complete/incomplete profiles reach reset without Jobs/onboarding; try missing/expired/used links and an ordinary signed-in session without recovery cookies; reject mismatching/weak passwords; retry failures; finish reset and sign in with the new password; ensure the old password fails. Check mobile/desktop layout and screen-reader alerts. Regression-check signup confirmation, OAuth, sign-in, sign-out and onboarding. Use approved test accounts only.
