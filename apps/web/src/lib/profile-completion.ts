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

/** Pass only confirmed backend snapshots. null means unknown, never zero percent. */
export function profileCompletion(profile: Profile | null, skills: Skill[] | null) {
  if (!profile || !Array.isArray(skills) || skills.some((skill) => !skill || typeof skill.id !== "string" || typeof skill.name !== "string")) return null;
  const items = completionItems.map((item) => {
    let completed: boolean;
    if (item.key === "skills") completed = skills.some((skill) => !!skill.id.trim() && !!skill.name.trim() && skill.name.trim().length <= 100);
    else if (item.key === "degree_level") completed = profile.degree_level === "bachelor" || profile.degree_level === "master";
    else if (item.key === "graduation_year") completed = typeof profile.graduation_year === "number" && Number.isInteger(profile.graduation_year) && profile.graduation_year >= 1900 && profile.graduation_year <= 2100;
    else {
      const value = profile[item.key];
      completed = typeof value === "string" && !!value.trim() && (item.key === "bio" || value.trim().length <= 255);
    }
    return { ...item, completed };
  });
  const completed = items.filter((item) => item.completed).length;
  return { items, completed, total: 8 as const, percentage: Math.round(completed / 8 * 100) };
}
