import type { ApiClient } from "./api/client";
import { ApiError } from "./api/client";

export type SavedSearch = {
  id: string; name: string; search: string | null; location: string | null;
  degree_level: "bachelor" | "master" | "both" | null; study_year: number | null; alert: boolean;
};
export type SearchFields = { search: string; location: string; degree: string; year: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const degrees: Record<string, string> = { bachelor: "Bachelor's", master: "Master's", both: "Bachelor's or Master's" };

/** "python · Berlin · Year 2" */
export function searchName({ search, location, degree, year }: SearchFields): string {
  return [search.trim(), location.trim(), degrees[degree] ?? "", year ? `Year ${year}` : ""].filter(Boolean).join(" · ").slice(0, 80);
}

/** The Jobs URL that reopens a saved search. */
export function searchHref(saved: SavedSearch): string {
  const params = new URLSearchParams({ view: "recommended", q: saved.search ?? "", page: "1" });
  if (saved.location) params.set("location", saved.location);
  if (saved.degree_level) params.set("degree_level", saved.degree_level);
  if (saved.study_year) params.set("study_year", String(saved.study_year));
  return "/jobs?" + params;
}

export function isSaved(saved: SavedSearch[], fields: SearchFields): boolean {
  const same = (a: string | number | null, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
  return saved.some((row) => same(row.search, fields.search) && same(row.location, fields.location) && same(row.degree_level, fields.degree) && same(row.study_year, fields.year));
}

/** Runs one saved-search form: intent save | alert | remove. Invalid input never reaches the API. */
export async function changeSavedSearch(api: ApiClient, form: FormData): Promise<void> {
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  if (intent === "save") {
    const degree = String(form.get("degree_level") ?? ""), year = String(form.get("study_year") ?? "");
    const fields: SearchFields = { search: String(form.get("q") ?? "").slice(0, 200), location: String(form.get("location") ?? "").slice(0, 255),
      degree: degrees[degree] ? degree : "", year: /^[1-6]$/.test(year) ? year : "" };
    const name = searchName(fields);
    if (!name) throw new ApiError(422, "empty_search");
    await api.request("/api/v1/saved-searches", { method: "POST", body: {
      name, search: fields.search.trim() || null, location: fields.location.trim() || null,
      degree_level: fields.degree || null, study_year: fields.year ? Number(fields.year) : null,
    } });
    return;
  }
  if (!UUID.test(id)) throw new ApiError(422, "invalid_saved_search");
  if (intent === "alert") await api.request(`/api/v1/saved-searches/${id}`, { method: "PATCH", body: { alert: form.get("alert") === "true" } });
  else if (intent === "remove") await api.request(`/api/v1/saved-searches/${id}`, { method: "DELETE" });
  else throw new ApiError(422, "invalid_intent");
}
