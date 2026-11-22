"use server";

import { revalidatePath } from "next/cache";
import { getAccountState, type Account } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import { isSkillList, normalizeSkillName, uniqueSkills, validateSkillName, type SkillsResult } from "@/lib/profile-skills";

async function authenticatedAccount() {
  const account = await getAccountState();
  if (account.kind === "guest" || account.kind === "not-configured") throw new ApiError(401, "session_missing");
  if (account.kind !== "ready") throw new ApiError(503, "account_unavailable");
  return account;
}
async function readSkills(account: Account, path: string) {
  const value = await account.api.request<unknown>(path);
  if (!isSkillList(value)) throw new ApiError(502, "invalid_skills");
  return uniqueSkills(value);
}
function failure(error: unknown): SkillsResult {
  const status = error instanceof ApiError ? error.status : 0;
  return { error: status === 401 ? "Your session has ended. Sign in again, then retry. Your previous skills are still shown."
    : status === 403 ? "This account cannot change these skills. Sign in with the correct account."
    : status === 422 ? "The skill change was not accepted. Check the name and try again. Your previous skills are still shown."
    : status === 429 ? "Too many requests. Wait before retrying. Your previous skills are still shown."
    : "We could not confirm the updated skills. Your previous list is still shown. Check your connection, then retry or refresh skills." };
}

export async function getProfileSkills(): Promise<SkillsResult> {
  try { return { skills: await readSkills(await authenticatedAccount(), "/api/v1/profile/skills") }; }
  catch (error) { return failure(error); }
}
export async function getSkillSuggestions(): Promise<SkillsResult> {
  try { return { skills: await readSkills(await authenticatedAccount(), "/api/v1/skills") }; }
  catch { return { error: "Skill suggestions could not be loaded. Retry suggestions, or enter a custom skill name." }; }
}

async function mutateSkill(value: unknown, operation: "add" | "remove"): Promise<SkillsResult> {
  const validated = validateSkillName(value);
  if (!validated.name) return { error: validated.error };
  const name = validated.name;
  try {
    const account = await authenticatedAccount();
    const current = await readSkills(account, "/api/v1/profile/skills");
    const exists = current.some((skill) => normalizeSkillName(skill.name) === name);
    if ((operation === "add" && exists) || (operation === "remove" && !exists)) {
      // A fresh read may reconcile a change not reflected in previously visited Jobs.
      revalidatePath("/profile"); revalidatePath("/jobs");
      return { skills: current, success: operation === "add" ? "This skill is already added." : "This skill has already been removed." };
    }
    if (operation === "add") await account.api.request("/api/v1/profile/skills", { method: "POST", body: { name } });
    // FastAPI's {name} path does not accept a slash even when URL-encoded. Use the existing replace contract for this case.
    else if (name.includes("/")) {
      const names = current.filter((skill) => normalizeSkillName(skill.name) !== name).map((skill) => skill.name);
      if (names.length > 100) return { error: "Remove other skills first, then retry this slash-containing name. The API can replace at most 100 skills at once. Your previous list is still shown." };
      await account.api.request("/api/v1/profile/skills", { method: "PUT", body: { names } });
    }
    else await account.api.request(`/api/v1/profile/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
    revalidatePath("/profile");
    revalidatePath("/jobs");
    // Do not trust optimistic state or just the mutation response: refresh the authoritative list.
    const skills = await readSkills(account, "/api/v1/profile/skills");
    return { skills, success: operation === "add" ? "Skill added." : "Skill removed." };
  } catch (error) { return failure(error); }
}
export async function addProfileSkill(name: unknown): Promise<SkillsResult> { return mutateSkill(name, "add"); }
export async function removeProfileSkill(name: unknown): Promise<SkillsResult> { return mutateSkill(name, "remove"); }
