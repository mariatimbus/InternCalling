"use server";
import { createClient } from "@supabase/supabase-js";
import type { ActionState } from "@/lib/auth/action-state";
import { getVerifiedAuth } from "@/lib/auth/account";
import { getPublicAuthConfig } from "@/lib/auth/server-config";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { passwordChangeError, validatePasswordChange } from "@/lib/auth/password-change";

export async function changePassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  const auth = await getVerifiedAuth();
  if (auth.kind !== "signed-in") return { error: "Your session has ended. Sign in again to change your password." };
  const hasPassword = auth.user.hasPassword;
  const current = String(form.get("current") ?? ""), password = String(form.get("password") ?? ""), confirmation = String(form.get("confirmation") ?? "");
  const problem = validatePasswordChange({ current, password, confirmation, hasPassword });
  if (problem) return { error: problem };
  try {
    if (hasPassword) {
      // Check the current password on a throwaway client so the signed-in session is untouched.
      const config = getPublicAuthConfig();
      if (!config) return { error: "Sign-in is not configured." };
      const verifier = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const checked = await verifier.auth.signInWithPassword({ email: auth.user.email, password: current });
      if (checked.error) return { error: checked.error.status === 429 ? passwordChangeError(checked.error) : "Your current password is incorrect." };
      await verifier.auth.signOut({ scope: "local" });
    }
    const client = await createServerSupabaseClient(true);
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: passwordChangeError(error) };
  } catch { return { error: "We could not change your password. Check your connection and try again." }; }
  return { success: hasPassword ? "Password changed." : "Password set. You can now also sign in with your email and this password." };
}
