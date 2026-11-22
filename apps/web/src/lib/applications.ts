import type { ApiClient } from "./api/client";
import { ApiError } from "./api/client";
import type { Application } from "./api/types";
export const applicationStatuses = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type TrackingState = { error: string; message: string; application: Application | null };

export async function changeTracking(api: ApiClient, form: FormData): Promise<TrackingState> {
  const opportunityId = String(form.get("opportunity_id") ?? "");
  const intent = form.get("intent");
  const status = String(form.get("status") ?? "");
  const notes = String(form.get("notes") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opportunityId)
    || !["save", "remove", "apply", "update"].includes(String(intent))
    || (intent === "update" && !applicationStatuses.some((value) => value === status)) || notes.length > 10000) {
    return { error: "Review the application status and notes (up to 10,000 characters).", message: "", application: null };
  }
  let current: Application | null = null;
  try {
    const list = await api.request<{ items: Application[] }>("/api/v1/applications");
    current = list.items.find((item) => item.opportunity_id === opportunityId) ?? null;
    if (intent === "remove") {
      if (current) await api.request(`/api/v1/applications/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      return { error: "", message: "Removed from tracking.", application: null };
    }
    if (intent === "save" && current) return { error: "", message: "Already tracked. Current progress kept.", application: current };
    if (intent === "update" && !current) throw new ApiError(404, "application_not_found");
    const body = intent === "update" ? { status, notes: notes.trim() || null } : { status: intent === "apply" ? "applied" : "saved" };
    const application = current
      ? await api.request<Application>(`/api/v1/applications/${encodeURIComponent(current.id)}`, { method: "PATCH", body })
      : await api.request<Application>("/api/v1/applications", { method: "POST", body: { opportunity_id: opportunityId, ...body } });
    return { error: "", message: "Application progress saved.", application };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      try {
        const list = await api.request<{ items: Application[] }>("/api/v1/applications");
        current = list.items.find((item) => item.opportunity_id === opportunityId) ?? current;
      } catch { /* Preserve the last confirmed state and show the conflict. */ }
    }
    return { error: error instanceof ApiError ? error.message : "The change could not be saved. Try again.", message: "", application: current };
  }
}
