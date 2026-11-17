# Authentication rate limits

The previous UI mapped both Supabase's `over_email_send_rate_limit` and `over_request_rate_limit` to “Too many attempts. Wait a few minutes and try again.” That hid the difference between a confirmation-email quota and authentication request throttling, and implied a reset time the app did not know.

The server now maps these failures separately in `src/lib/auth/error-message.ts`:

- An email quota error asks the user to check the inbox/spam folder for an existing confirmation link, or sign in if already confirmed. It does not promise that a short wait resets the quota.
- A request quota error tells the user to wait without automatically retrying.
- HTTP 429 without a recognized code still gets a safe throttling message.
- Upstream response bodies, email addresses, passwords and tokens are not included in diagnostic output.

## If Create account is limited

The message alone cannot establish which quota was exceeded. Supabase Auth logs can distinguish the error code. Do not reproduce it by repeatedly submitting real sign-ups.

1. Check the inbox and spam folder for a confirmation email already sent. Use the confirmation link in the original browser when possible, then use **Sign in** instead of creating the same account again.
2. If the code is `over_email_send_rate_limit`, wait for the provider quota to recover or configure a custom email sender. Supabase currently documents a project-wide limit of **2 emails per hour** for its built-in email sender; its default sender also restricts recipients to organization members. The actual project settings/provider should be checked before diagnosing an individual incident.
3. For normal application usage, configure a custom SMTP service in the project's **Authentication → Emails → SMTP Settings**, then review **Authentication → Rate Limits**. Keep SMTP credentials in Supabase's server-side configuration, never frontend variables or Git.
4. If the code is `over_request_rate_limit`, review the Auth logs and request limits. The app performs a single request per submission and does not automatically retry 429 failures.

Sign-up cookie changes are also staged until the provider accepts the request. A rejected sign-up cannot overwrite/remove the verifier belonging to an earlier confirmation email; the isolated browser test exercises that exact recovery path.

No project limits, email-confirmation requirements, RLS policies or accounts were changed by this fix. It cannot reset a hosted Supabase quota or deliver an email without a configured provider. Real signup/email delivery still needs an approved test account and a functioning email sender.

Official references: [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes).

Unit tests distinguish email/request throttling and check that the UI does not invent a countdown. The isolated browser suite simulates both failures without contacting real Supabase or sending email.
