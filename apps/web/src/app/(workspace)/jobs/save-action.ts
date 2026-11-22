"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/client";
import type { Application } from "@/lib/api/types";
import { requireCompletedAccount } from "@/lib/auth/account";

export type SaveResult = { status: Application["status"] } | { error: string };

function trackerStatus(value: unknown, opportunityId: string): Application["status"] | undefined {
  if (!value || typeof value !== "object") return;
  const row = value as Partial<Application>;
  if (row.opportunity_id !== opportunityId || typeof row.id !== "string" || !row.id) return;
  const status = row.status;
  if (status === "saved" || status === "applied" || status === "interview" || status === "offer" || status === "rejected") return status;
}

export async function saveOpportunity(opportunityId: string): Promise<SaveResult> {
  if (typeof opportunityId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(opportunityId)) {
    return { error: "This opportunity could not be identified. Reload the page and try again." };
  }

  const { api } = await requireCompletedAccount();
  const path = "/api/v1/applications";
  async function readStatus() {
    const { items } = await api.request<{ items: Application[] }>(path);
    return trackerStatus(items.find((item) => item.opportunity_id === opportunityId), opportunityId);
  }

  try {
    let status = await readStatus();
    if (!status) {
      try {
        const created = await api.request<unknown>(path, {
          method: "POST", body: { opportunity_id: opportunityId, status: "saved" },
        });
        status = trackerStatus(created, opportunityId);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        status = await readStatus();
      }
    }
    if (status) {
      revalidatePath("/jobs");
      revalidatePath("/applications");
      return { status };
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { error: "This opportunity is no longer available to save." };
    }
  }
  return { error: "We could not confirm the save. Try again." };
}
