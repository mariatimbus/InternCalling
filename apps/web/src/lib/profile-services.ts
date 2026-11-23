/** Live same-origin adapters for the existing editors. No keys or identity IDs in payloads. */
import { ApiError } from "./api/client";
import type { CollectionService, Experience, ExperienceDraft } from "./experience";
import { ProjectConflict, type Project, type ProjectDraft } from "./projects";
import { CertificateConflict, type Certificate, type CertificateDraft } from "./certificates";
import { HonourConflict, type Honour, type HonourDraft } from "./honours";
import { LanguageConflict, LanguageDuplicate, type Language, type LanguageDraft } from "./languages";
import { PublicationConflict, type Publication, type PublicationDraft } from "./publications";
import { ResumePdfConflict, isResumeMetadata, type ResumeAccess, type ResumePdfService } from "./resume-pdf";
import { ResumeReviewConflict, ResumeReviewRejected, type ResumeReviewService } from "./resume-review";
import { TailoringConflict, TailoringRejected, type ResumeTailoringService, type TailoringExport } from "./resume-tailoring";
import type { CvOnboardingServices } from "./cv-onboarding";

export type WorkspaceCapabilities = CvOnboardingServices["capabilities"] & { collections: boolean; tailoring: boolean };
export function createProfileServices(options: { transport?: typeof fetch; changed?: () => void;
  urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">; requestId?: () => string } = {}) {
  const transport = options.transport ?? fetch; const urls = options.urls ?? URL;
  const requestId = options.requestId ?? (() => crypto.randomUUID());
  const pending = new Map<string, string>();
  async function request<T>(path: string, init: { method?: string; body?: unknown; file?: File;
    signal?: AbortSignal; key?: string; binary?: boolean; validate?: (value: unknown) => boolean } = {}): Promise<T> {
    const method = init.method ?? "GET";
    const signature = init.key ?? (method === "GET" ? "" : method + path + JSON.stringify(init.body));
    if (signature && !pending.has(signature)) pending.set(signature, requestId());
    let response: Response;
    try {
      response = await transport("/api/backend/workspace" + path, { method, credentials: "same-origin", cache: "no-store",
        signal: init.signal, headers: { Accept: init.binary ? "application/pdf" : "application/json",
          ...(init.file ? { "Content-Type": "application/pdf" } : init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(signature ? { "Idempotency-Key": pending.get(signature)! } : {}) },
        ...(init.file ? { body: init.file } : init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError(503, "network_error");
    }
    if (!response.ok) {
      let code = "api_error";
      try { const value = await response.json(); if (typeof value?.error?.code === "string") code = value.error.code; } catch { /* Do not expose response bodies. */ }
      throw new ApiError(response.status, code);
    }
    if (response.status === 204) {
      if (method !== "DELETE") throw new ApiError(502, "invalid_response");
      if (signature) pending.delete(signature);
      return undefined as T;
    }
    let value: unknown;
    try { value = init.binary ? await response.blob() : await response.json(); }
    catch { throw new ApiError(502, "invalid_response"); }
    if (init.validate && !init.validate(value)) throw new ApiError(502, "invalid_response");
    if (signature) pending.delete(signature);
    return value as T;
  }
  function changed() { try { options.changed?.(); } catch { /* A UI refresh failure cannot undo a confirmed write. */ } }
  function collection<T, D>(section: string, Conflict: new () => Error): CollectionService<T, D> {
    async function mutate<R>(path: string, init: Parameters<typeof request>[1]) {
      try { const result = await request<R>(path, { ...init, ...(init?.method !== "DELETE" ? { validate: value => {
          if (!value || typeof value !== "object") return false;
          const row = value as { id?: unknown; revision?: unknown; position?: unknown };
          return typeof row.id === "string" && Number.isInteger(row.revision) && Number(row.revision) > 0 && Number.isInteger(row.position);
        } } : {}) }); changed(); return result; }
      catch (error) {
        if (error instanceof ApiError && error.code === "duplicate_language") throw new LanguageDuplicate();
        if (error instanceof ApiError && error.status === 409) throw new Conflict();
        throw error;
      }
    }
    return { load: () => request<T[]>(`/collections/${section}`),
      create: values => mutate<T>(`/collections/${section}`, { method: "POST", body: { values } }),
      update: (id, revision, values) => mutate<T>(`/collections/${section}/${encodeURIComponent(id)}`, { method: "PATCH", body: { revision, values } }),
      remove: (id, revision) => mutate<void>(`/collections/${section}/${encodeURIComponent(id)}?revision=${revision}`, { method: "DELETE" }) };
  }
  function privateAccess(blob: Blob): ResumeAccess {
    if (blob.type !== "application/pdf" || !blob.size || blob.size > 20 * 1024 * 1024) throw new ApiError(502, "invalid_pdf");
    const url = urls.createObjectURL(blob); let released = false;
    return { kind: "authenticated", url, release() { if (!released) { released = true; urls.revokeObjectURL(url); } } };
  }
  const files = new WeakMap<File, string>();
  const pdf: ResumePdfService = {
    load: ({ signal }) => request("/resume", { signal }),
    async upload(file, { replace, signal, onProgress }) {
      if (!files.has(file)) files.set(file, requestId());
      const query = replace ? `?replace_id=${encodeURIComponent(replace.id)}&replace_revision=${replace.revision}` : "";
      try {
        const value = await request<Awaited<ReturnType<ResumePdfService["upload"]>>>("/resume" + query, {
          method: "POST", file, signal, validate: isResumeMetadata, key: "upload:" + files.get(file) + query });
        onProgress({ transferredBytes: file.size, totalBytes: file.size }); changed(); return value;
      } catch (error) { if (error instanceof ApiError && error.status === 409) throw new ResumePdfConflict(); throw error; }
    },
    async access(resume, { signal }) {
      try { return privateAccess(await request<Blob>(`/resume/${encodeURIComponent(resume.id)}/file?revision=${resume.revision}`, { signal, binary: true })); }
      catch (error) { if (error instanceof ApiError && error.status === 409) throw new ResumePdfConflict(); throw error; }
    },
    async remove(resume, { signal }) {
      try { await request(`/resume/${encodeURIComponent(resume.id)}?revision=${resume.revision}`, { method: "DELETE", signal }); changed(); }
      catch (error) { if (error instanceof ApiError && error.status === 409) throw new ResumePdfConflict(); throw error; }
    },
  };
  async function reviewCall<T>(path: string, init: Parameters<typeof request>[1]) {
    try { const value = await request<T>(path, init); return value; }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new ResumeReviewConflict();
      if (error instanceof ApiError && [400, 404, 413, 415, 422].includes(error.status)) throw new ResumeReviewRejected();
      throw error;
    }
  }
  const review: ResumeReviewService = {
    start: (source, { signal }) => reviewCall("/resume/review/start", { method: "POST", body: { source }, signal }),
    status: (id, { signal }) => reviewCall(`/resume/review/${encodeURIComponent(id)}`, { signal }),
    result: (id, { signal }) => reviewCall(`/resume/review/${encodeURIComponent(id)}/result`, { signal }),
    async confirm(changes, { signal }) { const value = await reviewCall<Awaited<ReturnType<ResumeReviewService["confirm"]>>>("/resume/review/confirm", { method: "POST", body: changes, signal }); changed(); return value; },
  };
  async function tailorCall<T>(path: string, init: Parameters<typeof request>[1]) {
    try { return await request<T>(path, init); }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new TailoringConflict();
      if (error instanceof ApiError && [400, 404, 413, 422].includes(error.status)) throw new TailoringRejected();
      throw error;
    }
  }
  const tailoring: ResumeTailoringService = {
    load: (id, { signal }) => tailorCall(`/tailoring/context/${encodeURIComponent(id)}`, { signal }),
    generate: (scope, { signal, requestId }) => tailorCall("/tailoring/generate", { method: "POST", body: { scope, requestId }, signal }),
    generationStatus: (id, { signal }) => tailorCall(`/tailoring/generation/${encodeURIComponent(id)}`, { signal }),
    save: (draft, blocks, { signal, requestId }) => tailorCall("/tailoring/save", { method: "POST", body: { draft, blocks, requestId }, signal }),
    approve: (draft, { signal, requestId }) => tailorCall("/tailoring/approve", { method: "POST", body: { draft, requestId }, signal }),
    exportPdf: (approval, { signal, requestId }) => tailorCall("/tailoring/export", { method: "POST", body: { approval, requestId }, signal }),
    exportStatus: (id, { signal }) => tailorCall(`/tailoring/export/${encodeURIComponent(id)}`, { signal }),
    async download(id, { signal }) {
      const job = await tailorCall<TailoringExport>(`/tailoring/export/${encodeURIComponent(id)}`, { signal });
      const access = privateAccess(await tailorCall<Blob>(`/tailoring/export/${encodeURIComponent(id)}/file`, { signal, binary: true }));
      return { exportId: id, draft: job.draft, content: "approved-resume", access };
    },
  };
  const manual: CvOnboardingServices["manual"] = {
    load: ({ signal }) => request("/snapshot", { signal }),
    async confirm(draft, { signal, requestId, profileRevision }) {
      const value = await reviewCall<Awaited<ReturnType<CvOnboardingServices["manual"]["confirm"]>>>("/manual-confirm", {
        method: "POST", body: { draft, requestId, profileRevision }, signal });
      changed(); return value;
    },
  };
  return { capabilities: (signal?: AbortSignal) => request<WorkspaceCapabilities>("/capabilities", { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }),
    experience: collection<Experience, ExperienceDraft>("experience", Error),
    projects: collection<Project, ProjectDraft>("projects", ProjectConflict),
    certificates: collection<Certificate, CertificateDraft>("certificates", CertificateConflict),
    honours: collection<Honour, HonourDraft>("honours", HonourConflict),
    languages: collection<Language, LanguageDraft>("languages", LanguageConflict),
    publications: collection<Publication, PublicationDraft>("publications", PublicationConflict),
    pdf, review, manual, tailoring };
}
