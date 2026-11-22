# InternCalling web

Next.js App Router, strict TypeScript, Tailwind CSS v4 and Supabase Auth. Requires Node.js 22+ and npm. From `apps/web`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The home page and `/explore` read the real API catalog and provide official source links. Legacy `/preview/**` paths redirect to real pages. Configure the API origin to load opportunities; unavailable services show a truthful error state.

For real accounts, configure the browser-safe Supabase project URL, publishable key and FastAPI origin as described in [B3 authentication and onboarding](docs/B3-auth-onboarding.md). Never expose privileged credentials. No service-role key is needed by this frontend.

Password recovery uses a separate SSR/PKCE session. See [password recovery setup](docs/password-recovery.md) for the exact redirect allowlist, email template, trusted application origin and manual checks.

Both auth pages include Google and LinkedIn through Supabase Auth. Apple remains supported internally but is hidden because it is not configured. LinkedIn uses the `linkedin_oidc` provider; [setup instructions](docs/google-sign-in.md) explain the callback flow. Email sign-in remains available. See [current B3 verification](docs/B3-verification.md) for automated results, user-confirmed manual results and pending checks.

If account creation is throttled, [Auth rate limits](docs/auth-rate-limits.md) explains confirmation-email quotas, checking an existing email and configuring SMTP. Failed sign-ups preserve an earlier confirmation link; the app does not automatically retry throttled requests.

New users enter `/onboarding`, complete their study and location details, optionally add skills, then select **Find my matches**. Returning users with complete profiles go directly to `/jobs`. All authenticated pages share the responsive application shell. Sign-out is available in navigation and Account / Settings.

```sh
npm run lint
npm run typecheck
node --test tests/auth.test.mjs tests/recovery.test.mjs
npm run build
npm start
```

The B3 guide also describes the isolated browser suite, failure behavior, API contracts, deployment setup and remaining hosted verification. Local tests never create users in shared Supabase projects.

Shared components remain independent of API and Supabase business logic. The dark InternCalling palette, typography, rounded surfaces and scroll backdrop use semantic tokens in `src/app/globals.css`. Maintain visible keyboard focus, semantic navigation and reduced-motion support.

See [Maria review scope and fresh original-version verification](docs/review-for-maria.md). This frontend reads the configured API catalog; separate local publication data and scripts are not included in the frontend PR.
