import { validateProject, ProjectConflict, type Project, type ProjectDraft, type ProjectsService } from "./projects";
export function createProjectsPreviewService(): ProjectsService & { failNext: () => void } {
  const entries = new Map<string, Project>(); let sequence = 0, fail = false;
  function check() { if (fail) { fail = false; throw new Error("Simulated preview failure"); } }
  function values(draft: ProjectDraft) {
    if (Object.keys(validateProject(draft)).length) throw new Error("Validation failed");
    return { ...draft, name: draft.name.trim(), role: draft.role.trim(), startDate: draft.startDate.trim(), endDate: draft.ongoing ? "" : draft.endDate.trim(), repositoryUrl: draft.repositoryUrl.trim(), demoUrl: draft.demoUrl.trim(), technologies: draft.technologies.map(name => name.trim().toLowerCase()) };
  }
  return {
    failNext() { fail = true; },
    async load() { check(); return structuredClone([...entries.values()].sort((a,b) => a.position-b.position)); },
    async create(draft) { check(); const entry = { ...values(draft), id: "preview-project-" + ++sequence, revision: 1, position: sequence }; entries.set(entry.id, entry); return structuredClone(entry); },
    async update(id, revision, draft) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new ProjectConflict("Conflict"); const entry = { ...old, ...values(draft), revision: revision+1 }; entries.set(id, entry); return structuredClone(entry); },
    async remove(id, revision) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new ProjectConflict("Conflict"); entries.delete(id); },
  };
}
