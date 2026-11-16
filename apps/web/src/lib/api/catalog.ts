import "server-only";
import { createApiClient } from "./client";
import type { OpportunityPage } from "./types";
import { getApiBaseUrl } from "@/lib/auth/server-config";

/** Public reads use the same API transport without attaching a user's access token. */
export async function getPublicCatalog({ page = 1, pageSize = 12, search = "", type = "" } = {}) {
  const api = createApiClient({ baseUrl: getApiBaseUrl(), getAccessToken: async () => null });
  const params = new URLSearchParams({ is_active: "true", page: String(page), page_size: String(pageSize) });
  if (search.trim()) params.set("search", search.trim().slice(0, 200));
  if (type) params.set("opportunity_type", type);
  return api.request<OpportunityPage>(`/api/v1/opportunities?${params}`, { authentication: "none" });
}
