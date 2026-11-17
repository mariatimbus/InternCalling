"use server";
import { revalidatePath } from "next/cache";
import { requireCompletedAccount } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import { readPreferences } from "@/lib/profile-preferences";

export async function savePreferences(_previous: { message: string; error: boolean }, form: FormData) {
  const { api } = await requireCompletedAccount();
  let body;
  try { body = readPreferences(form); }
  catch (error) { return { error: true, message: error instanceof Error ? error.message : "Review your preferences." }; }
  try { await api.request("/api/v1/profile", { method: "PATCH", body }); }
  catch (error) { return { error: true, message: error instanceof ApiError ? error.message : "Preferences could not be saved. Try again." }; }
  revalidatePath("/profile");
  revalidatePath("/jobs");
  return { error: false, message: "Preferences saved. Your recommendations will use these details." };
}
