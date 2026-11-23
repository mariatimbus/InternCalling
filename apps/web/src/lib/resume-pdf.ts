/** PROPOSED frontend contract. No live routes, bucket or schema are agreed. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export type ResumeMetadata = { id: string; revision: number; fileName: string; sizeBytes: number; contentType: "application/pdf"; uploadedAt: string };
export type ResumeIdentity = Pick<ResumeMetadata, "id" | "revision">;
export type TransferProgress = { transferredBytes: number; totalBytes: number };
export type ResumeAccess = { kind: "authenticated"; url: string; release: () => void } | { kind: "authorized"; url: string; expiresAt: string } | { kind: "local-preview"; url: string; release: () => void };
export interface ResumePdfService {
  load(options: { signal: AbortSignal }): Promise<ResumeMetadata | null>;
  upload(file: File, options: { replace: ResumeIdentity | null; signal: AbortSignal; onProgress: (progress: TransferProgress) => void }): Promise<ResumeMetadata>;
  access(resume: ResumeIdentity, options: { intent: "view" | "download"; signal: AbortSignal }): Promise<ResumeAccess>;
  remove(resume: ResumeIdentity, options: { signal: AbortSignal }): Promise<void>;
}
export class ResumePdfConflict extends Error {}
export function validateResumeSelection(files: readonly File[]): { file?: File; error?: string; warning?: string } {
  if (files.length !== 1) return { error: "Choose one PDF file." };
  const file = files[0];
  if (!file.size) return { error: "Choose a non-empty PDF file." };
  if (file.size > MAX_RESUME_BYTES) return { error: "Choose a PDF of 5 MiB or smaller." };
  if (!/\.pdf$/i.test(file.name)) return { error: "Choose a file with a .pdf filename." };
  const mime = file.type.toLowerCase();
  if (mime && mime !== "application/pdf" && mime !== "application/octet-stream") return { error: "The file type and PDF filename disagree. Choose a PDF file." };
  return { file, ...(!mime || mime === "application/octet-stream" ? { warning: "Your browser did not identify the PDF type. Server validation is still required." } : {}) };
}
export function isResumeMetadata(value: unknown): value is ResumeMetadata {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ResumeMetadata>;
  return typeof row.id === "string" && !!row.id && Number.isInteger(row.revision) && row.revision! > 0 && typeof row.fileName === "string" && !!row.fileName.trim() && Number.isInteger(row.sizeBytes) && row.sizeBytes! > 0 && row.sizeBytes! <= MAX_RESUME_BYTES && row.contentType === "application/pdf" && typeof row.uploadedAt === "string" && Number.isFinite(Date.parse(row.uploadedAt));
}
export function safeResumeAccess(access: ResumeAccess, preview: boolean, now = Date.now()): boolean {
  try {
    if (/[\u0000-\u0020\u007f\\]/.test(access.url)) return false;
    const url = new URL(access.url);
    if (access.kind === "authenticated") return url.protocol === "blob:" && typeof access.release === "function";
    if (access.kind === "local-preview") return preview && url.protocol === "blob:" && typeof access.release === "function";
    return access.kind === "authorized" && /^https:\/\//i.test(access.url) && url.protocol === "https:" && !url.username && !url.password && !/^https:\/\/[^/?#]*@/i.test(access.url) && Number.isFinite(Date.parse(access.expiresAt)) && Date.parse(access.expiresAt) > now;
  } catch { return false; }
}
export const resumeFileSize = (bytes: number): string => bytes < 1024 ? bytes + " bytes" : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + " KiB" : (bytes / (1024 * 1024)).toFixed(2) + " MiB";
