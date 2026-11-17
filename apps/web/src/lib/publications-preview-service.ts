import { validatePublication, publicationAuthors, normalizeDoi, PublicationConflict, type Publication, type PublicationDraft, type PublicationsService } from "./publications";
/** Temporary isolated preview adapter. Never injected into the real Profile page. */
export function createPublicationsPreviewService(): PublicationsService & { failNext: () => void; conflictNext: () => void } {
  const entries = new Map<string, Publication>();
  let sequence = 0, fail = false, conflict = false;
  function check() { if (fail) { fail = false; throw new Error("Simulated preview failure"); } }
  function existing(id: string, revision: number) {
    if (conflict) { conflict = false; throw new PublicationConflict("Simulated revision conflict"); }
    const entry = entries.get(id);
    if (!entry || entry.revision !== revision) throw new PublicationConflict("Revision conflict");
    return entry;
  }
  function values(draft: PublicationDraft) {
    if (Object.keys(validatePublication(draft)).length) throw new Error("Validation failed");
    return { ...draft, title: draft.title.trim(), authors: publicationAuthors(draft.authors), publisher: draft.publisher.trim(), publicationDate: draft.publicationDate.trim(), doi: normalizeDoi(draft.doi).doi!, description: draft.description.trim(), publicationUrl: draft.publicationUrl.trim() };
  }
  return {
    failNext() { fail = true; },
    conflictNext() { conflict = true; },
    async load() { check(); return structuredClone([...entries.values()].sort((a,b) => a.position-b.position)); },
    async create(draft) { check(); const value = values(draft); const entry = { ...value, id: "preview-publication-" + ++sequence, revision: 1, position: sequence }; entries.set(entry.id, entry); return structuredClone(entry); },
    async update(id, revision, draft) { check(); const old = existing(id, revision); const entry = { ...old, ...values(draft), revision: revision+1 }; entries.set(id, entry); return structuredClone(entry); },
    async remove(id, revision) { check(); existing(id, revision); entries.delete(id); },
  };
}
