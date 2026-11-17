import catalog from "../../../../database/seeds/skills_catalog.proposed.json";
import type { Skill } from "./api/types";
import { normalizeSkillName } from "./profile-skills";

const labels: Record<string, string> = {
  "programming-and-cs": "Programming & Computer Science",
  "frontend-and-accessibility": "Frontend Development & Accessibility",
  "backend-and-apis": "Backend Development & APIs",
  "databases-and-data-engineering": "Databases & Data Engineering",
  "data-science-ml-ai": "Data Science & AI",
  "cloud-devops-infrastructure": "Cloud, DevOps & Infrastructure",
  "cybersecurity-and-networking": "Cybersecurity & Networking",
  "embedded-electronics-hardware": "Embedded Systems, Electronics & Hardware",
  "mobile-graphics-games-robotics-distributed": "Mobile, Graphics, Robotics & Distributed Systems",
};
export type DiscoveryChoice = { name: string; aliases: string[]; record?: Skill; selected?: boolean };
export type DiscoveryGroup = { id: string; label: string; choices: DiscoveryChoice[] };
/** Explicit local discovery metadata, not imported DB records or a new persistence contract. */
export function groupedSkills(live: Skill[], selected: Pick<Skill, "name">[], query: string, includeSelected = false) {
  const records = new Map<string, Skill>();
  for (const skill of live) if (!records.has(normalizeSkillName(skill.name))) records.set(normalizeSkillName(skill.name), skill);
  const classified = new Set(catalog.skills.map(skill => normalizeSkillName(skill.name)));
  const selectedNames = new Set(selected.map(skill => normalizeSkillName(skill.name)));
  const seen = new Set<string>();
  const needle = normalizeSkillName(query);
  let matches = 0;
  function available(name: string, aliases: string[]): DiscoveryChoice[] {
    const key = normalizeSkillName(name);
    if (seen.has(key)) return [];
    seen.add(key);
    if (!key.includes(needle) && !aliases.some(alias => normalizeSkillName(alias).includes(needle))) return [];
    matches++;
    if (selectedNames.has(key) && !includeSelected) return [];
    const record = records.get(key);
    return [{ name: record?.name ?? name, aliases, ...(record ? { record } : {}), ...(selectedNames.has(key) ? { selected: true } : {}) }];
  }
  const groups: DiscoveryGroup[] = catalog.categories.map(category => ({
    id: category.id, label: labels[category.id] ?? category.id,
    choices: catalog.skills.filter(skill => skill.category === category.id).flatMap(skill => available(skill.name, skill.aliases)),
  }));
  groups.push({ id: "other", label: "Other skills", choices: [...records].filter(([name]) => !classified.has(name)).flatMap(([, skill]) => available(skill.name, [])) });
  return { groups, matches };
}
export function canonicalDiscoveryName(query: string): string {
  const name = normalizeSkillName(query);
  return catalog.skills.find(skill => skill.name === name || skill.aliases.some(alias => normalizeSkillName(alias) === name))?.name ?? name;
}
