export const recoveryAcceptedMessage = "If an account exists for this email, you’ll receive a password reset link.";
export const invalidRecoveryMessage = "This password reset link is invalid, expired or already used. Request a new reset email and open it in the browser where you requested it.";

/** Use only claims verified by Supabase getClaims(), never a locally decoded JWT. */
export function hasRecoveryClaims(claims: { sub?: unknown; amr?: unknown } | null | undefined, userId: string) {
  return claims?.sub === userId && Array.isArray(claims.amr) && claims.amr.some((entry: unknown) =>
    !!entry && typeof entry === "object" && "method" in entry && entry.method === "recovery");
}

/** Explicit server configuration, never a forwarded Host or arbitrary redirect parameter. */
export function trustedRecoveryOrigin(configured = "http://localhost:3000") {
  const url = new URL(configured);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Invalid authentication application origin.");
  }
  return url.origin;
}

export function recoveryDestination(result: { error: unknown; data: { redirectType?: string | null; session: unknown } }) {
  return !result.error && result.data.session && result.data.redirectType === "recovery"
    ? "/reset-password" : "/reset-password?invalid=1";
}

export function validateResetPasswords(password: string, confirmation: string) {
  if (!password || password.length > 128) return "Enter a new password of no more than 128 characters.";
  if (password !== confirmation) return "The passwords do not match. Please try again.";
  // Supabase enforces the project's actual length, strength and compromised-password policy.
  return null;
}

export function recoveryErrorMessage(error: { code?: string; status?: number }, updating = false) {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") return "Too many requests. Wait before trying again; check your inbox and spam for a reset email already sent.";
  if (error.code === "weak_password") return "This password does not meet the account’s password policy. Choose a longer, stronger password.";
  if (error.code === "same_password") return "Choose a password different from your current password.";
  if (["otp_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt"].includes(error.code ?? "") || error.status === 401 || error.status === 403) return invalidRecoveryMessage;
  if (updating) return "We could not reset your password. Check your connection and try again.";
  // Do not expose account-specific provider responses.
  return "We could not send a reset link. Check your connection and try again.";
}
