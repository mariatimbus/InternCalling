export type JobsQuery = Record<string, string | string[] | undefined>;
export type JobsView = "recommended" | "saved" | "applied";

// Values the API accepts for each Jobs filter (see /opportunities/recommended).
export const workModels = ["remote", "hybrid", "onsite"] as const;
export const schedules = ["full_time", "part_time"] as const;
export const fields = ["software", "data", "hardware", "security", "product", "mechanical", "business"] as const;
export const postedWindows = ["1", "3", "7", "30"] as const;

export function readJobsQuery(query: JobsQuery) {
  const view: JobsView = query.view === "saved" || query.view === "applied" ? query.view : "recommended";
  const search = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const location = typeof query.location === "string" ? query.location.slice(0, 255).trim() : "";
  const degree = query.degree_level === "bachelor" || query.degree_level === "master" || query.degree_level === "both" ? query.degree_level : "";
  const year = typeof query.study_year === "string" && /^[1-6]$/.test(query.study_year) ? query.study_year : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | "" => allowed.find((option) => option === value) ?? "";
  const workModel = pick(query.work_model, workModels);
  const schedule = pick(query.schedule, schedules);
  const field = pick(query.field, fields);
  const postedWithin = pick(query.posted_within, postedWindows);
  const noExperience = query.no_experience === "true" ? "true" : "";
  const filters = new URLSearchParams();
  if (location) filters.set("location", location);
  if (degree) filters.set("degree_level", degree);
  if (year) filters.set("study_year", year);
  if (workModel) filters.set("work_model", workModel);
  if (schedule) filters.set("schedule", schedule);
  if (field) filters.set("field", field);
  if (postedWithin) filters.set("posted_within", postedWithin);
  if (noExperience) filters.set("no_experience", noExperience);
  return { view, search, location, degree, year, workModel, schedule, field, postedWithin, noExperience, page, filters };
}

export function jobsParams({ view, search, page, filters }: ReturnType<typeof readJobsQuery>) {
  return new URLSearchParams({ view, q: search, page: String(page), ...Object.fromEntries(filters) });
}

export function recommendationParams(state: ReturnType<typeof readJobsQuery>, page = state.page) {
  const params = new URLSearchParams(state.filters);
  params.set("opportunity_type", "internship");
  params.set("is_active", "true");
  params.set("page", String(page));
  params.set("page_size", "12");
  if (state.search.trim()) params.set("search", state.search.trim());
  return params;
}

export function detailReturnParams(query: JobsQuery) {
  if (query.view !== "recommended" && query.view !== "saved" && query.view !== "applied") return new URLSearchParams();
  return jobsParams(readJobsQuery(query));
}
