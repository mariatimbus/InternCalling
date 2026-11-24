import type { Profile, Skill } from "./api/types";

export const completionItems = [
  { key: "headline", label: "Headline", role: "Introduces you; not used in current matching." },
  { key: "bio", label: "Bio", role: "Describes you; not used in current matching." },
  { key: "degree_level", label: "Degree level", role: "Used to check an opportunity's degree requirement when it is specified." },
  { key: "university", label: "University", role: "Profile information; not used in current matching." },
  { key: "field_of_study", label: "Field of study", role: "Used for field-fit scoring against opportunity text." },
  { key: "graduation_year", label: "Graduation year", role: "Profile information; not used by current scoring or eligibility gates." },
  { key: "location", label: "Location", role: "Used for location scoring and conservative location checks; free text alone does not establish ineligibility." },
  { key: "skills", label: "Saved skills", role: "Used for skill-overlap scoring. Current matching has limits for multiword names and aliases." },
] as const;
export type CompletionKey = typeof completionItems[number]["key"];

export function isProfileFieldComplete(profile: Profile, key: Exclude<CompletionKey, "skills">) {
  if (key === "degree_level") return profile.degree_level === "bachelor" || profile.degree_level === "master";
  if (key === "graduation_year") {
    const year = profile.graduation_year;
    return typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= 2100;
  }
  const value = profile[key];
  return typeof value === "string" && !!value.trim() && (key === "bio" || value.trim().length <= 255);
}

/** Pass only confirmed backend snapshots. null means unknown, never zero percent. */
export function profileCompletion(profile: Profile | null, skills: Skill[] | null) {
  if (!profile || !Array.isArray(skills) || skills.some((skill) => !skill || typeof skill.id !== "string" || typeof skill.name !== "string")) return null;
  const items = completionItems.map((item) => {
    const completed = item.key === "skills"
      ? skills.some((skill) => !!skill.id.trim() && !!skill.name.trim() && skill.name.trim().length <= 100)
      : isProfileFieldComplete(profile, item.key);
    return { ...item, completed };
  });
  const completed = items.filter((item) => item.completed).length;
  return { items, completed, total: 8 as const, percentage: Math.round(completed / 8 * 100) };
}
