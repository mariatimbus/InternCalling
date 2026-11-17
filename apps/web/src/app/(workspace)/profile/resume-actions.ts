"use server";

import { revalidatePath } from "next/cache";
import { getAccountState } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import { isProfile } from "@/lib/api/types";
import { validateResumeUrl, type ResumeSaveResult } from "@/lib/resume-link";

export async function saveResumeLink(value: unknown): Promise<ResumeSaveResult> {
  const validated = validateResumeUrl(value);
  if (!Object.hasOwn(validated, "resumeUrl")) return { error: validated.error };
  try {
    const account = await getAccountState();
    if (account.kind === "guest" || account.kind === "not-configured") return { error: "Your session has ended. Sign in again, then retry. Your entered link is still here." };
    if (account.kind !== "ready") return { error: "Your saved profile could not be loaded. Check your connection and try Save again." };
    if (validated.resumeUrl === account.profile.resume_url) return { resumeUrl: account.profile.resume_url, success: "No changes to save." };
    const persisted = await account.api.request<unknown>("/api/v1/profile", { method: "PATCH", body: { resume_url: validated.resumeUrl } });
    revalidatePath("/profile");
    if (!isProfile(persisted) || persisted.user_id !== account.user.id || persisted.id !== account.profile.id || validateResumeUrl(persisted.resume_url).error) throw new ApiError(502, "invalid_profile");
    return { resumeUrl: persisted.resume_url, success: persisted.resume_url ? "Resume link saved." : "Resume link removed." };
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    return { error: status === 401 ? "Your session could not be verified. Sign in again, then retry."
      : status === 403 ? "This account cannot update this profile. Sign in with the correct account."
      : status === 422 ? "The link was not accepted. Check the URL and its 512-character limit, then try Save again."
      : status === 429 ? "Too many requests. Wait before trying Save again."
      : "We could not confirm the resume link was saved. Check your connection and try Save again, or reload to check the saved link. Your entered value is still here." };
  }
}
