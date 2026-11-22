"use server";

import { getAccountState } from "@/lib/auth/account";
import { isSkillList } from "@/lib/profile-skills";
import type { Profile, Skill } from "@/lib/api/types";

export type CompletionData = { profile?: Profile; skills?: Skill[]; error?: string };
export async function refreshCompletion(): Promise<CompletionData> {
  try {
    const account = await getAccountState();
    if (account.kind !== "ready") return { error: "Saved profile data is unavailable. Retry, or sign in again if your session has ended." };
    try {
      const skills = await account.api.request<unknown>("/api/v1/profile/skills");
      if (!isSkillList(skills)) throw new Error("Invalid skills");
      return { profile: account.profile, skills };
    } catch { return { profile: account.profile, error: "Saved skills could not be loaded. Check your connection and retry." }; }
  } catch { return { error: "Saved profile data could not be loaded. Check your connection and retry." }; }
}
