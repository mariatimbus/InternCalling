/** Rules shared by the settings form and its server action. Supabase enforces the real policy. */
export function validatePasswordChange({ current, password, confirmation, hasPassword }: { current: string; password: string; confirmation: string; hasPassword: boolean }) {
  if (hasPassword && !current) return "Enter your current password.";
  if (!password || password.length > 128) return "Enter a new password of no more than 128 characters.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password !== confirmation) return "The new passwords do not match.";
  if (hasPassword && password === current) return "Choose a password different from your current password.";
  return null;
}

export function passwordChangeError(error: { code?: string; status?: number }) {
  if (error.status === 429 || error.code === "over_request_rate_limit") return "Too many attempts. Wait a minute and try again.";
  if (error.code === "weak_password") return "This password does not meet the account’s password policy. Choose a longer, stronger password.";
  if (error.code === "same_password") return "Choose a password different from your current password.";
  if (error.code === "reauthentication_needed" || error.code === "session_not_found" || error.status === 401)
    return "For your security, sign out and sign in again, then change your password.";
  return "We could not change your password. Check your connection and try again.";
}
