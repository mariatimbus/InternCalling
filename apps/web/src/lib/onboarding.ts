import type { DegreeLevel, Profile } from "./api/types";

export type OnboardingDraft = { degree_level: string; university: string; field_of_study: string; graduation_year: string; location: string; skills: string[] };
export type OnboardingErrors = Partial<Record<keyof OnboardingDraft, string>>;
export type OnboardingPayload = { degree_level: DegreeLevel; university: string; field_of_study: string; graduation_year: number; location: string };

/** Completion is derived from persisted supported fields, never from client storage or user metadata. */
export type OnboardingCompletionProfile = Pick<Profile, "degree_level" | "university" | "field_of_study" | "graduation_year" | "location">;
export function isProfileComplete(profile: OnboardingCompletionProfile): boolean {
  return ["bachelor", "master"].includes(profile.degree_level ?? "")
    && [profile.university, profile.field_of_study, profile.location].every((value) => !!value?.trim() && value.trim().length <= 255)
    && Number.isInteger(profile.graduation_year) && Number(profile.graduation_year) >= 1900 && Number(profile.graduation_year) <= 2100;
}

export function validateOnboarding(draft: OnboardingDraft): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (!["bachelor", "master"].includes(draft.degree_level)) errors.degree_level = "Choose Bachelor's or Master's.";
  for (const key of ["university", "field_of_study", "location"] as const) {
    if (!draft[key].trim()) errors[key] = "Enter an answer to continue.";
    else if (draft[key].trim().length > 255) errors[key] = "Use 255 characters or fewer.";
  }
  const year = Number(draft.graduation_year);
  if (!draft.graduation_year.trim() || !Number.isInteger(year) || year < 1900 || year > 2100) errors.graduation_year = "Enter a whole year between 1900 and 2100.";
  if (draft.skills.length > 100 || draft.skills.some((skill) => !skill.trim() || skill.trim().length > 100)) errors.skills = "Use up to 100 skills, with 100 characters or fewer per skill.";
  return errors;
}

export function onboardingPayload(draft: OnboardingDraft): OnboardingPayload {
  return { degree_level: draft.degree_level as DegreeLevel, university: draft.university.trim(), field_of_study: draft.field_of_study.trim(), graduation_year: Number(draft.graduation_year), location: draft.location.trim() };
}

/** Whitelist request fields; identifiers and unsupported preferences cannot be written. */
export function readOnboardingForm(form: FormData): OnboardingDraft | null {
  try {
    const skills: unknown = JSON.parse(String(form.get("skills") ?? "[]"));
    if (!Array.isArray(skills) || !skills.every((value) => typeof value === "string")) return null;
    return { degree_level: String(form.get("degree_level") ?? ""), university: String(form.get("university") ?? ""), field_of_study: String(form.get("field_of_study") ?? ""), graduation_year: String(form.get("graduation_year") ?? ""), location: String(form.get("location") ?? ""), skills: [...new Set(skills.map((value) => value.trim().toLowerCase()))] };
  } catch { return null; }
}

/** Fill the onboarding form from CV proposals: a proposed fact wins, saved answers stay where the CV is silent. */
export function prefillOnboarding(draft: OnboardingDraft, proposed: { profile: Partial<Record<string, string | null>>; skills: string[] }): OnboardingDraft {
  const pick = (key: "university" | "field_of_study" | "graduation_year" | "location") => proposed.profile[key]?.trim() || draft[key];
  const degree = proposed.profile.degree_level?.trim() ?? "";
  return {
    degree_level: ["bachelor", "master"].includes(degree) ? degree : draft.degree_level,
    university: pick("university"), field_of_study: pick("field_of_study"), graduation_year: pick("graduation_year"), location: pick("location"),
    skills: [...new Set([...draft.skills, ...proposed.skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean)])].slice(0, 100),
  };
}
