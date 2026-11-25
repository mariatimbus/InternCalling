import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError, createApiClient } from "@/lib/api/client";
import { isProfile, type Profile } from "@/lib/api/types";
import { isProfileComplete } from "@/lib/onboarding";
import { getApiBaseUrl, getPublicAuthConfig } from "./server-config";
import { createServerSupabaseClient } from "./supabase-server";
import { isAuthNetworkError } from "./config";
import { socialLinksFromMetadata } from "@/lib/profile-social-links";

/** Only the server key can set app_metadata, so this flag is not self-granted; the API checks it again. */
function isReviewer(metadata: Record<string, unknown> | undefined) {
  return Array.isArray(metadata?.roles) && metadata.roles.includes("reviewer");
}

/** Request-scoped verification against Supabase, never against unverified cookie user data. */
export const getVerifiedAuth = cache(async () => {
  try {
    const config = getPublicAuthConfig();
    if (!config) return { kind: "not-configured" as const };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.auth.getUser();
    if (isAuthNetworkError(error)) return { kind: "unavailable" as const };
    if (!data.user || error) return { kind: "guest" as const };
    return { kind: "signed-in" as const, config, client, user: { id: data.user.id, email: data.user.email ?? "Your account", reviewer: isReviewer(data.user.app_metadata), socialLinks: socialLinksFromMetadata(data.user.user_metadata) } };
  } catch { return { kind: "unavailable" as const }; }
});

/** The API profile is fetched without caching and checked against the verified provider identity. */
export const getAccountState = cache(async () => {
  const auth = await getVerifiedAuth();
  if (auth.kind !== "signed-in") return auth;
  try {
    const api = createApiClient({ baseUrl: getApiBaseUrl(), getAccessToken: async () => {
      const { data, error } = await auth.client.auth.getSession();
      return error ? null : data.session?.access_token ?? null;
    } });
    const profile = await api.request<unknown>("/api/v1/profile");
    if (!isProfile(profile) || profile.user_id !== auth.user.id) throw new ApiError(502, "invalid_profile_owner");
    return { kind: "ready" as const, user: auth.user, config: auth.config, api, profile };
  } catch (error) {
    return { kind: "profile-error" as const, message: error instanceof ApiError ? error.message : "We could not load your profile. Please try again." };
  }
});

export type Account = Extract<Awaited<ReturnType<typeof getAccountState>>, { kind: "ready" }>;

/** Data entry points repeat the guard: a layout alone is not an authorization boundary. */
export async function requireAccount(): Promise<Account> {
  const state = await getAccountState();
  if (state.kind === "guest" || state.kind === "not-configured") redirect("/sign-in");
  if (state.kind !== "ready") throw new Error("Account temporarily unavailable. Please reload and try again.");
  return state;
}

export async function requireCompletedAccount(): Promise<Account & { profile: Profile }> {
  const account = await requireAccount();
  if (!isProfileComplete(account.profile)) redirect("/onboarding");
  return account;
}
