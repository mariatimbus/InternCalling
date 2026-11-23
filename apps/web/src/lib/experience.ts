/** Live editor contract; persisted through /api/backend/workspace/collections. */
export type ExperienceDraft = { role: string; organization: string; location: string; startDate: string; endDate: string; current: boolean; description: string; achievements: string };
export type Experience = Omit<ExperienceDraft, "achievements"> & { id: string; revision: number; position: number; achievements: string[] };
export interface CollectionService<T, D> {
  load(): Promise<T[]>;
  create(draft: D): Promise<T>;
  update(id: string, revision: number, draft: D): Promise<T>;
  remove(id: string, revision: number): Promise<void>;
}
export type ExperienceService = CollectionService<Experience, ExperienceDraft>;
export const emptyExperience = (): ExperienceDraft => ({ role: "", organization: "", location: "", startDate: "", endDate: "", current: false, description: "", achievements: "" });
export function experienceDraft(entry: Experience): ExperienceDraft { return { role: entry.role, organization: entry.organization, location: entry.location, startDate: entry.startDate, endDate: entry.endDate, current: entry.current, description: entry.description, achievements: entry.achievements.join("\n") }; }
export function partialDate(value: string): { year: number; month?: number } | null {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]), month = match[2] ? Number(match[2]) : undefined;
  return year >= 1900 && year <= 2100 && (month === undefined || month >= 1 && month <= 12) ? { year, ...(month === undefined ? {} : { month }) } : null;
}
export function validateExperience(draft: ExperienceDraft): Partial<Record<keyof ExperienceDraft, string>> {
  const errors: Partial<Record<keyof ExperienceDraft, string>> = {};
  for (const key of ["role", "organization"] as const) if (!draft[key].trim() || draft[key].trim().length > 255) errors[key] = "Enter 1 to 255 characters.";
  if (draft.location.trim().length > 255) errors.location = "Use 255 characters or fewer.";
  const start = partialDate(draft.startDate), end = partialDate(draft.endDate);
  if (!start) errors.startDate = "Enter YYYY or YYYY-MM, with a year from 1900 to 2100.";
  if (!draft.current && !end) errors.endDate = "Enter YYYY or YYYY-MM, or select currently working here.";
  if (draft.current && draft.endDate.trim()) errors.endDate = "Current roles cannot have an end date.";
  // Compare known precision only. A year-only date is an interval, not an invented day/month.
  if (start && end && !draft.current && (end.year < start.year || end.year === start.year && start.month !== undefined && end.month !== undefined && end.month < start.month)) errors.endDate = "End date cannot be before start date.";
  if (draft.description.length > 5000) errors.description = "Use 5000 characters or fewer.";
  const bullets = draft.achievements.split("\n").map(s => s.trim()).filter(Boolean);
  if (bullets.length > 20 || bullets.some(s => s.length > 500)) errors.achievements = "Use up to 20 bullets, with 500 characters or fewer each.";
  return errors;
}
