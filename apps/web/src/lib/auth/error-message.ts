/** Map provider failures to useful messages without exposing upstream response bodies. */
export function authErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === "invalid_credentials") return "Check your email and password and try again.";
  if (error.code === "email_not_confirmed") return "Confirm your email before signing in. You can then return here.";
  if (error.code === "weak_password") return "Choose a stronger password and try again.";
  if (error.code === "over_email_send_rate_limit") {
    return "Confirmation emails are temporarily limited. Check your inbox and spam for an email already sent. If you have confirmed your email, sign in. Otherwise, try again later.";
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many authentication requests. Wait before trying again. No new request will be sent automatically.";
  }
  if (error.code === "signup_disabled") return "New accounts are temporarily unavailable. Please try again later.";
  return "We could not complete authentication. Check your connection and try again.";
}
