import type { Profile } from "./api/types";

export const editableProfileFields = ["headline", "bio", "degree_level", "study_year", "university", "field_of_study", "graduation_year", "location"] as const;
export const studyYears = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

/** Calendar year in which the current academic year (Sep–Aug) ends. */
export function academicEnd(today = new Date()): number {
  return today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();
}

/** "Year 2 of 4" from the study year and the graduation year, when both are known. */
export function programPosition(studyYear: string | null | undefined, graduationYear: number | null | undefined, today = new Date()): string | null {
  const year = studyYears.indexOf(studyYear as typeof studyYears[number]) + 1;
  if (!year || !graduationYear) return null;
  const total = year + graduationYear - academicEnd(today);
  return total >= year ? `Year ${year} of ${total}` : null;
}
export type ProfileField = typeof editableProfileFields[number];
export type ProfileDraft = Record<ProfileField, string>;
export type ProfilePatch = Partial<Pick<Profile, ProfileField>>;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;
export type ProfileSaveResult = { profile?: Profile; success?: string; error?: string; fields?: ProfileFieldErrors };

export function profileDraft(profile: Profile): ProfileDraft {
  return Object.fromEntries(editableProfileFields.map((key) => [key, profile[key]?.toString() ?? ""])) as ProfileDraft;
}

/** Validate only the editable backend fields; identity, resume and skills cannot be written here. */
export function validateProfilePatch(value: unknown): { patch?: ProfilePatch; fields?: ProfileFieldErrors; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !editableProfileFields.some((field) => field === key))) {
    return { error: "The profile changes could not be read. Reload the page and try again." };
  }
  const patch: Record<string, string | number | null> = {};
  const fields: ProfileFieldErrors = {};
  for (const key of editableProfileFields) {
    if (!Object.hasOwn(value, key)) continue;
    const raw = (value as Record<string, unknown>)[key];
    if (raw === null) { patch[key] = null; continue; }
    if (key === "graduation_year") {
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1900 || raw > 2100) fields[key] = "Enter a whole year between 1900 and 2100, or leave it blank.";
      else patch[key] = raw;
    } else if (typeof raw !== "string") fields[key] = "Enter text or leave this field blank.";
    else {
      const text = raw.trim();
      if (key === "degree_level" && text && text !== "bachelor" && text !== "master") fields[key] = "Choose Bachelor's, Master's or Not provided.";
      else if (key === "study_year" && text && !studyYears.some(year => year === text)) fields[key] = "Choose your year of study or Not provided.";
      else if (key !== "bio" && text.length > 255) fields[key] = "Use 255 characters or fewer.";
      else patch[key] = text || null;
    }
  }
  return Object.keys(fields).length ? { fields, error: "Review the highlighted fields and try again." } : { patch: patch as ProfilePatch };
}

export function validateProfileDraft(draft: ProfileDraft): ProfileFieldErrors {
  const year = draft.graduation_year.trim();
  const { fields = {} } = validateProfilePatch({ ...draft, graduation_year: year ? Number(year) : null });
  if (year && !/^\d+$/.test(year)) fields.graduation_year = "Enter a whole year between 1900 and 2100, or leave it blank.";
  return fields;
}

/** Compare client intent with the displayed baseline; untouched fields are never submitted. */
export function changedProfileFields(profile: Profile, draft: ProfileDraft): ProfilePatch {
  const initial = profileDraft(profile);
  const patch: Record<string, string | number | null> = {};
  for (const key of editableProfileFields) {
    if (draft[key] === initial[key]) continue;
    const text = draft[key].trim();
    const value = !text ? null : key === "graduation_year" ? Number(text) : text;
    if (value !== profile[key]) patch[key] = value;
  }
  return patch as ProfilePatch;
}
