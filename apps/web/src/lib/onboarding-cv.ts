import {
  buildReviewChanges, createReviewDraft, providedReviewValue, selectProposals,
  type ParsingResult, type ReviewChanges, type ReviewSection, type ReviewValues,
} from "./resume-review";

/** One entry found in the CV, editable on the onboarding screen before it is saved. */
export type OnboardingEntry = { key: string; section: ReviewSection; include: boolean; values: ReviewValues };
export type EntryField = { key: string; label: string; kind?: "long" | "list" | "check"; hint?: string };

const date = "YYYY or YYYY-MM";
/** The fields a student is likely to fix; everything else is edited later in Profile. */
export const entryFields: Record<ReviewSection, EntryField[]> = {
  experience: [{ key: "role", label: "Role" }, { key: "organization", label: "Organization" }, { key: "startDate", label: "Start", hint: date }, { key: "endDate", label: "End", hint: date }, { key: "current", label: "I still work here", kind: "check" }, { key: "achievements", label: "What you did", kind: "long" }],
  projects: [{ key: "name", label: "Name" }, { key: "role", label: "Your role" }, { key: "technologies", label: "Technologies", kind: "list", hint: "Comma-separated" }, { key: "description", label: "Description", kind: "long" }],
  languages: [{ key: "name", label: "Language" }, { key: "cefr", label: "Level", hint: "A1 to C2" }, { key: "native", label: "Native", kind: "check" }],
  certificates: [{ key: "name", label: "Certificate" }, { key: "organization", label: "Issued by" }, { key: "issueDate", label: "Issued", hint: date }],
  honours: [{ key: "title", label: "Award" }, { key: "receivedDate", label: "Received", hint: date }, { key: "description", label: "Details", kind: "long" }],
  publications: [{ key: "title", label: "Title" }, { key: "publisher", label: "Publisher" }, { key: "publicationDate", label: "Published", hint: date }],
};
export const sectionLabels: Record<ReviewSection, string> = { experience: "Experience", projects: "Project", languages: "Language", certificates: "Certificate", honours: "Award", publications: "Publication" };

/** Complete entries the student does not already have, all ticked. */
export function onboardingEntries(result: ParsingResult): OnboardingEntry[] {
  return selectProposals(result).collections.flatMap(row => {
    const candidate = result.proposed.collections.find(item => item.key === row.key);
    if (!candidate || row.decision !== "add") return [];
    const values = Object.fromEntries(Object.entries(row.fields).flatMap(([key, field]) => field.value === undefined ? [] : [[key, field.value]])) as ReviewValues;
    return [{ key: row.key, section: candidate.section, include: true, values }];
  });
}

/** "Frontend Developer · Acme", "Chess Engine", "English C2". */
export function entryLabel(entry: OnboardingEntry): string {
  const text = (key: string) => typeof entry.values[key] === "string" ? (entry.values[key] as string).trim() : "";
  const label = {
    experience: [text("role"), text("organization")].filter(Boolean).join(" · "),
    projects: text("name"), languages: [text("name"), text("cefr")].filter(Boolean).join(" "),
    certificates: [text("name"), text("organization")].filter(Boolean).join(" · "),
    honours: text("title"), publications: text("title"),
  }[entry.section];
  return label || sectionLabels[entry.section];
}

/** Changes for the ticked entries as edited; null when none are ticked. Errors are keyed "entry.field". */
export function onboardingChanges(result: ParsingResult, entries: OnboardingEntry[], requestId: string): { changes: ReviewChanges | null; errors: Record<string, string> } {
  const kept = entries.filter(entry => entry.include);
  if (!kept.length) return { changes: null, errors: {} };
  const collections = kept.map(entry => ({
    key: entry.key, decision: "add" as const, targetId: "",
    fields: Object.fromEntries(Object.entries(entry.values).map(([key, raw]) => {
      // A list is typed as "React, Vue" and split only when saved.
      const value = typeof raw === "string" && entryFields[entry.section].some(field => field.key === key && field.kind === "list")
        ? raw.split(",").map(item => item.trim()).filter(Boolean) : raw;
      return [key, { apply: providedReviewValue(value), value }];
    })),
  }));
  const built = buildReviewChanges(result, { ...createReviewDraft(result), skills: [], collections }, requestId);
  return { changes: built.changes ?? null, errors: built.errors };
}
