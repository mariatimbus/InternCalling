# Google sign-in

Both `/sign-in` and `/sign-up` provide **Continue with Google**, using the existing Supabase Auth system. No Google SDK, extra frontend dependency, custom JWT or second identity system is added.

## Flow

The server action first checks the project's public provider settings. If Google is disabled or the provider cannot be reached, the page displays a safe message and email/password sign-in remains available. The button is still visible so provider availability can change without a new application build.

When enabled, the action calls `supabase.auth.signInWithOAuth` with `provider: "google"`. The SSR SDK stores a PKCE verifier in a cookie and redirects to Supabase's authorize endpoint. The request uses `prompt=select_account` and requests no extra Google API permissions or offline access.

Supabase handles Google's response, then redirects to the app's `/auth/callback?flow=google`. The existing callback exchanges the code, stores the Supabase session and sends the user to `/jobs`. The normal server guards send incomplete profiles to onboarding and let complete profiles enter Jobs. Cancelled consent or an invalid code returns to sign-in with a useful generic message; upstream error descriptions are never rendered.

## Provider activation

Current status (16 November 2026): the user confirmed working Google and LinkedIn sign-in and refresh persistence. This supersedes the earlier disabled-provider observations below; retain the following as setup history/guidance, not an outstanding activation blocker. Apple is hidden from the UI. See [current verification](B3-verification.md).

The configured project reported Google disabled during implementation. Frontend code alone cannot enable Google's OAuth provider: the project needs credentials created in the Google Auth Platform.

1. Open the Google Auth Platform console in the Google Cloud project that should own InternCalling's sign-in.
2. Configure the app's branding, audience and consent screen. In testing mode, add the approved Google test accounts. Use only basic identity scopes (`openid`, email and profile).
3. In **Clients**, create an OAuth client of type **Web application**. Add `http://localhost:3000` as an authorized JavaScript origin for local development, plus the actual production origin when available.
4. Set the Google client's **Authorized redirect URI** to the Supabase callback:

   ```text
   https://eabtzresfdzekvqpyrrx.supabase.co/auth/v1/callback
   ```

5. In this Supabase project's **Authentication â†’ Sign In / Providers â†’ Google**, enable Google and enter the Google Client ID and Client Secret. Keep nonce validation enabled.
6. In Supabase **Authentication â†’ URL Configuration**, set the local Site URL to `http://localhost:3000` and allow the app callback `http://localhost:3000/auth/callback` (including the `flow=google` query if the allowlist matcher is configured strictly). Add actual deployed callback URLs separately; do not use a blanket production wildcard.
7. Save the provider configuration and retry **Continue with Google**. Test a new user, a returning complete user and cancelled consent. No frontend rebuild is required after enabling the provider.

The Google redirect URI in step 4 and the app callback in step 6 are different endpoints. Google returns to Supabase; Supabase returns to InternCalling.

The Client Secret belongs in Supabase's provider configuration. Never put it in `NEXT_PUBLIC_*`, browser code, screenshots or Git. If configuring it locally for an authorized setup workflow, use ignored server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values. Those local variables do not automatically activate the hosted provider. Existing Supabase publishable/service keys cannot replace Google OAuth credentials.

Official instructions: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google?environment=server&platform=web).

## Verification

The isolated browser suite covers button visibility on both pages, a disabled provider, provider network failure, cancelled consent without error disclosure, PKCE callback/cookie exchange, onboarding for a new Google identity and direct Jobs access for a complete Google identity. The protocol double never contacts Google or creates hosted users. The user has confirmed real Google and LinkedIn sign-in on the original worktree; the current publication's fresh test scope is recorded in review-for-maria.md.

## Additional providers

Apple and LinkedIn now use the same server action and callback. The allowed Supabase provider IDs are `google`, `apple` and `linkedin_oidc`; arbitrary submitted providers are rejected. Each visible button submits its provider explicitly; Apple is hidden while unconfigured. Failure messages identify the selected provider without exposing upstream error descriptions. Configure Apple and LinkedIn in Supabase with their own provider credentials and the same Supabase callback URL. Official guides: [Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple) and [LinkedIn OIDC](https://supabase.com/docs/guides/auth/social-sign-in/auth-linkedin).
