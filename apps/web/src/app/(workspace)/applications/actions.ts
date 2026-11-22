"use server";
import { revalidatePath } from "next/cache";
import { requireCompletedAccount } from "@/lib/auth/account";
import { changeTracking, type TrackingState } from "@/lib/applications";
export async function updateTracking(_previous: TrackingState, form: FormData): Promise<TrackingState> {
  const { api } = await requireCompletedAccount();
  const result = await changeTracking(api, form);
  revalidatePath("/jobs"); revalidatePath("/applications");
  return result.error && !result.application ? { ...result, application: _previous.application } : result;
}
