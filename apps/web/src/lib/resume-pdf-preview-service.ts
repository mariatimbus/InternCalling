import { validateResumeSelection, ResumePdfConflict, type ResumePdfService, type ResumeMetadata, type ResumeIdentity } from "./resume-pdf";
/** Simulated memory-only uploads; no network bytes or real signed URLs. */
export function createResumePdfPreviewService(options: { delayMs?: number; urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> } = {}) {
  let saved: { metadata: ResumeMetadata; file: File } | null = null, sequence = 0;
  let failure: "upload" | "remove" | "load" | "access" | null = null, conflict = false;
  const urls = options.urls ?? URL, releases = new Set<() => void>();
  const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, options.delayMs ?? 900);
    signal.addEventListener("abort", abort, { once: true });
  });
  function check(kind: typeof failure) { if (failure === kind) { failure = null; throw new Error("Simulated request failure"); } }
  function expected(identity: ResumeIdentity | null) {
    if (conflict) { conflict = false; throw new ResumePdfConflict("Simulated conflict"); }
    if (saved ? !identity || saved.metadata.id !== identity.id || saved.metadata.revision !== identity.revision : identity !== null) throw new ResumePdfConflict("Revision conflict");
  }
  const service: ResumePdfService = {
    async load({ signal }) { await wait(signal); signal.throwIfAborted(); check("load"); return saved ? structuredClone(saved.metadata) : null; },
    async upload(file, { replace, signal }) {
      if (validateResumeSelection([file]).error) throw new Error("Invalid file");
      await wait(signal); signal.throwIfAborted(); check("upload"); expected(replace);
      const metadata: ResumeMetadata = { id: "preview-resume-" + ++sequence, revision: 1, fileName: file.name, sizeBytes: file.size, contentType: "application/pdf", uploadedAt: new Date().toISOString() };
      releases.forEach(release => release()); saved = { metadata, file };
      return structuredClone(metadata);
    },
    async access(identity, { signal }) {
      await wait(signal); signal.throwIfAborted(); check("access");
      if (!saved || saved.metadata.id !== identity.id || saved.metadata.revision !== identity.revision) throw new ResumePdfConflict("Revision conflict");
      const url = urls.createObjectURL(saved.file); let released = false;
      const release = () => { if (!released) { released = true; urls.revokeObjectURL(url); releases.delete(release); } };
      releases.add(release);
      return { kind: "local-preview", url, release };
    },
    async remove(identity, { signal }) { await wait(signal); signal.throwIfAborted(); check("remove"); expected(identity); releases.forEach(release => release()); saved = null; },
  };
  return Object.assign(service, {
    failNext(kind: NonNullable<typeof failure> = "upload") { failure = kind; },
    conflictNext() { conflict = true; },
    changeRevision() { if(saved){saved.metadata.revision++;return structuredClone(saved.metadata);}return null; },
    dispose() { releases.forEach(release => release()); saved = null; },
  });
}
