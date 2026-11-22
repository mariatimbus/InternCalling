"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/auth/action-state";
import { createRecoveryClient, getRecoveryOrigin } from "@/lib/auth/recovery-server";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { hasRecoveryClaims, invalidRecoveryMessage, recoveryAcceptedMessage, recoveryErrorMessage, validateResetPasswords } from "@/lib/auth/recovery";

async function isTrustedRequest() {
  return (await headers()).get("origin") === getRecoveryOrigin();
}

export async function requestPasswordReset(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };
  try {
    if (!await isTrustedRequest()) return { error: "Reload the page from the configured application address and try again.", email };
    const recovery = await createRecoveryClient(true, true);
    const { error } = await recovery.client.auth.resetPasswordForEmail(email, { redirectTo: `${getRecoveryOrigin()}/auth/recovery/callback` });
    if (error) return { error: recoveryErrorMessage(error), email };
    // Failed/throttled requests must not destroy an earlier email's PKCE verifier.
    recovery.commitCookies();
    return { success: recoveryAcceptedMessage, email };
  } catch { return { error: "We could not send a reset link. Check your connection and try again.", email }; }
}

export async function resetPassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (!await isTrustedRequest()) return { error: "Reload the page from the configured application address and try again." };
    const { client } = await createRecoveryClient(true);
    const verified = await client.auth.getUser();
    if (verified.error) return { error: verified.error.name === "AuthSessionMissingError" ? invalidRecoveryMessage : recoveryErrorMessage(verified.error, true) };
    if (!verified.data.user) return { error: invalidRecoveryMessage };
    const claims = await client.auth.getClaims();
    if (claims.error) return { error: recoveryErrorMessage(claims.error, true) };
    if (!hasRecoveryClaims(claims.data?.claims, verified.data.user.id)) return { error: invalidRecoveryMessage };
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const problem = validateResetPasswords(password, confirmation);
    if (problem) return { error: problem };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: recoveryErrorMessage(error, true) };
  } catch { return { error: "We could not reset your password. Check your connection and try again." }; }
  return finishPasswordRecovery();
}

/** Separate safe retry: a failed sign-out must not submit the new password a second time. */
export async function finishPasswordRecovery(): Promise<ActionState> {
  try {
    if (!await isTrustedRequest()) return { error: "Reload the page and try again.", success: "Your password was reset. Finish signing out before signing in again." };
    const { client } = await createRecoveryClient(true);
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { error: "We could not finish signing out. Please try again.", success: "Your password was reset." };
    const ordinary = await createServerSupabaseClient(true);
    const signedOut = await ordinary.auth.signOut({ scope: "local" });
    if (signedOut.error) return { error: "We could not finish signing out. Please try again.", success: "Your password was reset." };
  } catch { return { error: "We could not finish signing out. Please try again.", success: "Your password was reset." }; }
  redirect("/sign-in?password-reset=1");
}
