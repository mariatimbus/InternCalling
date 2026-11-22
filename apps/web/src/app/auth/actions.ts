"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createDeferredSignupClient } from "@/lib/auth/supabase-server";
import { getPublicAuthConfig } from "@/lib/auth/server-config";
import { isSocialProvider, socialProviderName } from "@/lib/auth/social-providers";
import { authErrorMessage } from "@/lib/auth/error-message";
import { getAccountState } from "@/lib/auth/account";
import type { ActionState } from "@/lib/auth/action-state";
import { ApiError } from "@/lib/api/client";
import { isProfile } from "@/lib/api/types";
import { isProfileComplete, readOnboardingForm, validateOnboarding, onboardingPayload } from "@/lib/onboarding";

async function authenticate(mode: "sign-in" | "sign-up", form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (!password || password.length > 128 || (mode === "sign-up" && password.length < 8)) return { error: mode === "sign-up" ? "Use a password between 8 and 128 characters." : "Enter your password.", email };
  try {
    const signup = mode === "sign-up" ? await createDeferredSignupClient() : null;
    const supabase = signup?.client ?? await createServerSupabaseClient(true);
    if (mode === "sign-up") {
      const origin = (await headers()).get("origin");
      if (!origin || !["http:", "https:"].includes(new URL(origin).protocol)) return { error: "We could not verify the request. Reload the page and try again.", email };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL("/auth/callback", origin).href } });
      if (error) return { error: authErrorMessage(error), email };
      signup?.commitCookies();
      if (!data.session) return { success: "Check your email to confirm your account, then sign in. Open the confirmation link in the same browser when possible.", email };
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: authErrorMessage(error), invalidCredentials: error.code === "invalid_credentials", email };
    }
  } catch { return { error: "Authentication is unavailable. Check the connection and configuration, then try again.", email }; }
  revalidatePath("/", "layout");
  redirect("/jobs");
}

export async function signIn(_previous: ActionState, form: FormData) { return authenticate("sign-in", form); }
export async function signUp(_previous: ActionState, form: FormData) { return authenticate("sign-up", form); }

export async function signInWithProvider(_previous: ActionState, form: FormData): Promise<ActionState> {
  const provider = form.get("provider");
  if (!isSocialProvider(provider)) return { error: "Choose a supported sign-in option." };
  const name = socialProviderName(provider);
  let authorizationUrl: string;
  try {
    const config = getPublicAuthConfig();
    if (!config) return { error: `${name} sign-in is currently unavailable. You can continue with email.` };
    const origin = (await headers()).get("origin");
    if (!origin || !["http:", "https:"].includes(new URL(origin).protocol)) return { error: "Reload the page and try again." };

    // Check availability before leaving the app, so a disabled provider has a useful recovery path.
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { error: `We could not connect to ${name} sign-in. Try again, or continue with email.` };
    const settings: { external?: Record<string, boolean> } = await response.json();
    if (settings.external?.[provider] !== true) return { error: `${name} sign-in is currently unavailable. You can continue with email.` };

    const supabase = await createServerSupabaseClient(true);
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("flow", provider);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.href, skipBrowserRedirect: true, ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}) },
    });
    if (error || !data.url) return { error: `We could not start ${name} sign-in. Please try again.` };
    const target = new URL(data.url);
    if (target.origin !== config.url || target.pathname !== "/auth/v1/authorize") return { error: `We could not start ${name} sign-in. Please try again.` };
    authorizationUrl = target.href;
  } catch { return { error: `We could not connect to ${name} sign-in. Check your connection and try again.` }; }
  // Keep redirects outside the catch: Next.js uses an exception to complete navigation.
  redirect(authorizationUrl);
}

export async function signOut(): Promise<ActionState> {
  try {
    const supabase = await createServerSupabaseClient(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "We could not sign you out. Check your connection and try again." };
  } catch { return { error: "We could not sign you out. Reload and try again." }; }
  revalidatePath("/", "layout");
  redirect("/sign-in?signed-out=1");
}

export async function finishOnboarding(_previous: ActionState, form: FormData): Promise<ActionState> {
  const account = await getAccountState();
  if (account.kind === "guest" || account.kind === "not-configured") redirect("/sign-in");
  if (account.kind !== "ready") return { error: "We could not load your account. Reload and try again. Your answers have not been submitted." };
  const draft = readOnboardingForm(form);
  if (!draft) return { error: "The profile could not be read. Review your answers and try again." };
  const fields = validateOnboarding(draft);
  if (Object.keys(fields).length) return { error: "Review the highlighted details before continuing.", fields };
  try {
    // Store optional skills first. Completion becomes durable only when the final profile write succeeds.
    await account.api.request("/api/v1/profile/skills", { method: "PUT", body: { names: draft.skills } });
    const profile = await account.api.request<unknown>("/api/v1/profile", { method: "PATCH", body: onboardingPayload(draft) });
    if (!isProfile(profile) || profile.user_id !== account.user.id || !isProfileComplete(profile)) throw new ApiError(502, "invalid_profile");
  } catch (error) { return { error: error instanceof ApiError ? error.message : "We could not save your profile. Please try again." }; }
  revalidatePath("/", "layout");
  redirect("/jobs");
}
