import { validateCertificate, CertificateConflict, type Certificate, type CertificateDraft, type CertificatesService } from "./certificates";
export function createCertificatesPreviewService(): CertificatesService & { failNext: () => void } {
  const entries = new Map<string, Certificate>(); let sequence = 0, fail = false;
  function check() { if (fail) { fail = false; throw new Error("Simulated preview failure"); } }
  function values(draft: CertificateDraft) {
    if (Object.keys(validateCertificate(draft)).length) throw new Error("Validation failed");
    return { ...draft, name: draft.name.trim(), organization: draft.organization.trim(), issueDate: draft.issueDate.trim(), expirationDate: draft.doesNotExpire ? "" : draft.expirationDate.trim(), credentialId: draft.credentialId.trim(), credentialUrl: draft.credentialUrl.trim() };
  }
  return {
    failNext() { fail = true; },
    async load() { check(); return structuredClone([...entries.values()].sort((a,b) => a.position-b.position)); },
    async create(draft) { check(); const entry = { ...values(draft), id: "preview-certificate-" + ++sequence, revision: 1, position: sequence }; entries.set(entry.id, entry); return structuredClone(entry); },
    async update(id, revision, draft) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new CertificateConflict("Conflict"); const entry = { ...old, ...values(draft), revision: revision+1 }; entries.set(id, entry); return structuredClone(entry); },
    async remove(id, revision) { check(); const old = entries.get(id); if (!old || old.revision !== revision) throw new CertificateConflict("Conflict"); entries.delete(id); },
  };
}
