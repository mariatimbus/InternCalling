import type { MatchRequirement } from "./api/types";
import type { IconName } from "@/components/ui/icon";

export type Tone = "met" | "partial" | "missing";
/** A short, scannable chip for a job card: "Python · SQL", "German C1", "Remote". */
export type RequirementChip = { key: string; tone: Tone; icon: IconName; label: string; strong: string[]; title: string };

export const requirementIcons: Record<MatchRequirement["key"], IconName> = {
  skills: "code", field_fit: "jobs", languages: "globe", experience: "applications", eligibility: "award", location: "location",
};

const list = (items: string[], max = 3) => items.slice(0, max).join(" · ") + (items.length > max ? ` +${items.length - max}` : "");

/** Requirements met fully, and how many the posting states: "3 of 4". */
export function requirementSummary(requirements: MatchRequirement[] | undefined) {
  const all = requirements ?? [];
  return { met: all.filter((r) => r.status === "met").length, total: all.length };
}

/**
 * Card chips: what matches first (green), then what is missing (red). Skills show the
 * matched names in bold; a requirement that is partly met shows both sides.
 */
export function requirementChips(requirements: MatchRequirement[] | undefined, max = 5): RequirementChip[] {
  const fits: RequirementChip[] = [], gaps: RequirementChip[] = [];
  for (const r of requirements ?? []) {
    const icon = requirementIcons[r.key];
    const title = `${r.label}: ${r.summary}`;
    if (r.key === "skills") {
      if (r.matched.length) fits.push({ key: "skills", tone: r.status === "met" ? "met" : "partial", icon, label: "", strong: r.matched.slice(0, 3), title });
      if (r.missing.length) gaps.push({ key: "skills-missing", tone: "missing", icon, label: list(r.missing, 2), strong: [], title: `Also asks for: ${r.missing.join(", ")}` });
      continue;
    }
    const text = r.key === "field_fit" || r.key === "eligibility" ? r.label
      : r.key === "location" ? (r.status === "met" && /remote/i.test(r.summary) ? "Remote" : r.matched[0] ?? r.missing[0] ?? r.label)
      : r.key === "experience" ? (r.status === "met" ? "Relevant experience" : r.status === "partial" ? "Relevant projects" : "Asks for experience")
      : r.status === "missing" ? list(r.missing.map((m) => m.split(" — ")[0]), 2) : list(r.matched, 2);
    (r.status === "missing" ? gaps : fits).push({ key: r.key, tone: r.status, icon, label: text, strong: [], title });
  }
  return [...fits, ...gaps].slice(0, max);
}
