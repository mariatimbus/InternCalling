"use server";

import { revalidatePath } from "next/cache";
import { getAccountState } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import { isProfile } from "@/lib/api/types";
import { validateProfilePatch, type ProfileSaveResult } from "@/lib/profile-edit";

export async function saveProfile(changes: unknown): Promise<ProfileSaveResult> {
  const validated = validateProfilePatch(changes);
  if (!validated.patch) return validated;
  const account = await getAccountState();
  if (account.kind === "guest" || account.kind === "not-configured") return { error: "Your session has ended. Sign in again, then retry your changes." };
  if (account.kind !== "ready") return { error: "We could not load your saved profile. Check your connection and try Save again. Your edits are still here." };
  const patch = Object.fromEntries(Object.entries(validated.patch).filter(([key, value]) => value !== account.profile[key as keyof typeof validated.patch]));
  if (!Object.keys(patch).length) {
    // Reconciliation can confirm a write from another tab or an earlier unconfirmed response.
    revalidatePath("/profile"); revalidatePath("/jobs");
    return { profile: account.profile, success: "No changes to save." };
  }
  let persisted: unknown;
  try {
    persisted = await account.api.request<unknown>("/api/v1/profile", { method: "PATCH", body: patch });
    if (!isProfile(persisted) || persisted.user_id !== account.user.id || persisted.id !== account.profile.id) throw new ApiError(502, "invalid_profile");
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return { error: status === 401 ? "Your session could not be verified. Sign in again before retrying. Your edits are still here."
      : status === 403 ? "This account cannot update the profile. Sign in with the correct account before retrying."
      : status === 422 ? "Some changes were not accepted. Check the field lengths, degree level and graduation year, then try Save again."
      : status === 429 ? "Too many requests. Wait before trying Save again. Your edits are still here."
      : "We could not confirm your profile was saved. Check your connection and try Save again. Your edits are still here." };
  }
  revalidatePath("/profile");
  revalidatePath("/jobs");
  return { profile: persisted, success: "Profile saved." };
}
