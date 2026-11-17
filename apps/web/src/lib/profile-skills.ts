import type { Skill } from "./api/types";

export type SkillsResult = { skills?: Skill[]; error?: string; success?: string };
export const normalizeSkillName = (name: string) => name.trim().toLowerCase();

export function validateSkillName(value: unknown): { name?: string; error?: string } {
  if (typeof value !== "string") return { error: "Enter a skill name." };
  const name = normalizeSkillName(value);
  return !name || name.length > 100 ? { error: "Use a skill name between 1 and 100 characters." } : { name };
}

export function isSkillList(value: unknown): value is Skill[] {
  return Array.isArray(value) && value.every((item) => !!item && typeof item === "object"
    && typeof item.id === "string" && typeof item.name === "string" && !!item.name.trim());
}

export function uniqueSkills(skills: Skill[]): Skill[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const name = normalizeSkillName(skill.name);
    if (seen.has(name)) return false;
    seen.add(name); return true;
  });
}

/** GET /skills is a complete array; no server search/pagination parameters exist. */
export function skillSuggestions(catalog: Skill[], selected: Skill[], query: string): Skill[] {
  const names = new Set(selected.map((skill) => normalizeSkillName(skill.name)));
  const needle = normalizeSkillName(query);
  return uniqueSkills(catalog).filter((skill) => !names.has(normalizeSkillName(skill.name)) && normalizeSkillName(skill.name).includes(needle)).slice(0, 10);
}

/** Keep catalog transport failures distinct from a successful empty response. */
export function skillCatalogResult(result: SkillsResult): { skills: Skill[]; error: string } {
  if (!result.error && isSkillList(result.skills)) return { skills: uniqueSkills(result.skills), error: "" };
  return { skills: [], error: result.error || "Skill suggestions could not be loaded. Retry suggestions, or enter a custom skill name." };
}

export function skillSuggestionState(catalog: Skill[], selected: Skill[], query: string, loading: boolean, error: string) {
  const choices = skillSuggestions(catalog, selected, query);
  if (loading) return { kind: "loading", choices: [], message: "Loading skill suggestions..." };
  if (error) return { kind: "error", choices: [], message: error };
  if (!catalog.length) return { kind: "empty", choices: [], message: "The skill catalog is empty. You can still add a custom skill." };
  if (choices.length) return { kind: "available", choices, message: "" };
  const needle = normalizeSkillName(query);
  const matching = catalog.some((skill) => normalizeSkillName(skill.name).includes(needle));
  return matching
    ? { kind: "selected", choices: [], message: "All matching catalog skills are already added. Try another search or add a custom skill." }
    : { kind: "unmatched", choices: [], message: "No matching suggestions. You can add this as a custom skill." };
}
