"use server";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/auth/account";
import { decideReview } from "@/lib/review";

export async function decide(form: FormData): Promise<void> {
  const { api, user } = await requireAccount();
  if (!user.reviewer) notFound(); // the API enforces this too
  await decideReview(api, form);
  revalidatePath("/review"); revalidatePath("/jobs");
}
