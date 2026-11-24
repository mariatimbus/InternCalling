"use server";
import { revalidatePath } from "next/cache";
import { requireCompletedAccount } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import { changeSavedSearch } from "@/lib/saved-searches";

export async function savedSearchAction(form: FormData): Promise<void> {
  const { api } = await requireCompletedAccount();
  try { await changeSavedSearch(api, form); }
  catch (error) { if (!(error instanceof ApiError && [404, 409].includes(error.status))) throw error; } // already changed elsewhere, or at the limit
  revalidatePath("/jobs");
}
