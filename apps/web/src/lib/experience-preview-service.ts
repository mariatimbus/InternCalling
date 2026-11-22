import { validateExperience, type Experience, type ExperienceDraft, type ExperienceService } from "./experience";
/** Development preview only; callers must gate the route. No storage/network or sample records. */
export function createExperiencePreviewService(): ExperienceService & { failNext: () => void } {
  const entries = new Map<string, Experience>();
  let sequence = 0, fail = false;
  function check() { if (fail) { fail = false; throw new Error("Simulated preview failure"); } }
  function values(draft: ExperienceDraft) {
    if (Object.keys(validateExperience(draft)).length) throw new Error("Validation failed");
    return { ...draft, role: draft.role.trim(), organization: draft.organization.trim(), location: draft.location.trim(), startDate: draft.startDate.trim(), endDate: draft.current ? "" : draft.endDate.trim(), achievements: draft.achievements.split("\n").map(s => s.trim()).filter(Boolean) };
  }
  return {
    failNext() { fail = true; },
    async load() { check(); return structuredClone([...entries.values()].sort((a, b) => a.position - b.position)); },
    async create(draft) { check(); const entry = { ...values(draft), id: "preview-" + ++sequence, revision: 1, position: sequence }; entries.set(entry.id, entry); return structuredClone(entry); },
    async update(id, revision, draft) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new Error("Conflict"); const entry = { ...old, ...values(draft), revision: revision + 1 }; entries.set(id, entry); return structuredClone(entry); },
    async remove(id, revision) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new Error("Conflict"); entries.delete(id); },
  };
}
