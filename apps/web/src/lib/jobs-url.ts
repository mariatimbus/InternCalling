export type JobsQuery = Record<string, string | string[] | undefined>;
export type JobsView = "recommended" | "saved" | "applied";

export function readJobsQuery(query: JobsQuery) {
  const view: JobsView = query.view === "saved" || query.view === "applied" ? query.view : "recommended";
  const search = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const location = typeof query.location === "string" ? query.location.slice(0, 255).trim() : "";
  const degree = query.degree_level === "bachelor" || query.degree_level === "master" || query.degree_level === "both" ? query.degree_level : "";
  const year = typeof query.study_year === "string" && /^[1-6]$/.test(query.study_year) ? query.study_year : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const filters = new URLSearchParams();
  if (location) filters.set("location", location);
  if (degree) filters.set("degree_level", degree);
  if (year) filters.set("study_year", year);
  return { view, search, location, degree, year, page, filters };
}

export function jobsParams({ view, search, page, filters }: ReturnType<typeof readJobsQuery>) {
  return new URLSearchParams({ view, q: search, page: String(page), ...Object.fromEntries(filters) });
}

export function detailReturnParams(query: JobsQuery) {
  if (query.view !== "recommended" && query.view !== "saved" && query.view !== "applied") return new URLSearchParams();
  return jobsParams(readJobsQuery(query));
}
