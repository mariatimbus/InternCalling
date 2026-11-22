import type { StudyYear } from "./api/types";

export const studyYears = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;
export function readPreferences(form: FormData) {
  const year = String(form.get("study_year") ?? "");
  if (year && !studyYears.some((value) => value === year)) throw new Error("Choose a valid study year.");
  function list(name: string) {
    const values = [...new Set(String(form.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean))];
    if (values.length > 50 || values.some((value) => value.length > 100)) throw new Error("Use up to 50 entries per preference, each with 100 characters or fewer.");
    return values;
  }
  const remote = String(form.get("remote_preferred") ?? "");
  if (!["", "true", "false"].includes(remote)) throw new Error("Choose a valid remote preference.");
  return { study_year: (year || null) as StudyYear | null,
    interests: list("interests"), preferred_tech_domains: list("preferred_tech_domains"),
    preferred_locations: list("preferred_locations"), remote_preferred: remote === "" ? null : remote === "true" };
}
