import { validateLanguage, hasDuplicateLanguageName, LanguageConflict, LanguageDuplicate, type Language, type LanguageDraft, type LanguagesService } from "./languages";
/** Temporary isolated preview adapter. Never injected into the real Profile page. */
export function createLanguagesPreviewService(): LanguagesService & { failNext: () => void; conflictNext: () => void } {
  const entries = new Map<string, Language>();
  let sequence = 0, fail = false, conflict = false;
  function check() { if (fail) { fail = false; throw new Error("Simulated preview failure"); } }
  function existing(id: string, revision: number) {
    if (conflict) { conflict = false; throw new LanguageConflict("Simulated revision conflict"); }
    const entry = entries.get(id);
    if (!entry || entry.revision !== revision) throw new LanguageConflict("Revision conflict");
    return entry;
  }
  function values(draft: LanguageDraft, editingId?: string) {
    const errors = validateLanguage(draft, [...entries.values()], editingId);
    if (hasDuplicateLanguageName(draft.name, [...entries.values()], editingId)) throw new LanguageDuplicate("This language is already listed.");
    if (Object.keys(errors).length) throw new Error("Validation failed");
    return { ...draft, name: draft.name.trim(), referenceName: draft.referenceName.trim(), referenceUrl: draft.referenceUrl.trim() };
  }

  return {
    failNext() { fail = true; },
    conflictNext() { conflict = true; },
    async load() { check(); return structuredClone([...entries.values()].sort((a,b) => a.position-b.position)); },
    async create(draft) { check(); const value = values(draft); const entry = { ...value, id: "preview-language-" + ++sequence, revision: 1, position: sequence }; entries.set(entry.id, entry); return structuredClone(entry); },
    async update(id, revision, draft) { check(); const old = existing(id, revision); const entry = { ...old, ...values(draft, id), revision: revision+1 }; entries.set(id, entry); return structuredClone(entry); },
    async remove(id, revision) { check(); existing(id, revision); entries.delete(id); },
  };
}
