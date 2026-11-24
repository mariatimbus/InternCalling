import type { ApiClient } from "./api/client";
import { ApiError } from "./api/client";

export type ReviewItem = {
  id: string; title: string; organization: string | null; location: string | null; url: string;
  description: string | null; source: string; posted_at: string | null; deadline: string | null; review_reason: string | null;
};
export type ReviewQueue = { items: ReviewItem[]; total: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Publish or hide one queued posting. A posting already decided elsewhere just leaves the queue. */
export async function decideReview(api: ApiClient, form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!UUID.test(id) || !["approve", "reject"].includes(decision)) throw new ApiError(422, "invalid_decision");
  try {
    await api.request(`/api/v1/review/opportunities/${id}`, { method: "POST", body: { decision } });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  }
}
