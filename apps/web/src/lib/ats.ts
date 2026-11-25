/** ATS check and tailored PDFs for one job (API: /workspace/ats, /workspace/documents). */
export type AtsStatus = "met" | "partial" | "missing" | "not_stated";
export type AtsRow = {
  key: "title" | "experience" | "education" | "keywords" | "industry";
  label: string; status: AtsStatus; job: string; you: string; matched: string[]; missing: string[];
};
export type AtsReport = { score: number | null; label: string; rows: AtsRow[] };
export type DocumentKind = "resume" | "cover-letter";

export const MAX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 60;

/** Adds a typed keyword unless it is empty, too long, already there or over the limit. */
export function addKeyword(keywords: string[], typed: string): string[] {
  const keyword = typed.trim().replace(/\s+/g, " ");
  if (!keyword || keyword.length > MAX_KEYWORD_LENGTH || keywords.length >= MAX_KEYWORDS) return keywords;
  if (keywords.some(k => k.toLowerCase() === keyword.toLowerCase())) return keywords;
  return [...keywords, keyword];
}

type Transport = typeof fetch;
const post = (transport: Transport, path: string, keywords: string[]) => transport("/api/backend/workspace/" + path, {
  method: "POST", credentials: "same-origin", cache: "no-store",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords }),
});

export async function checkAts(jobId: string, keywords: string[], transport: Transport = fetch): Promise<AtsReport> {
  const response = await post(transport, `ats/${jobId}`, keywords);
  if (!response.ok) throw new Error("ATS check failed");
  return response.json();
}

/** The tailored PDF, or an error code the UI can explain. */
export async function tailoredPdf(jobId: string, kind: DocumentKind, keywords: string[], transport: Transport = fetch): Promise<Blob> {
  const response = await post(transport, `documents/${jobId}/${kind}`, keywords);
  if (!response.ok) {
    let code = "upstream_error";
    try { code = (await response.json())?.error?.code ?? code; } catch { /* keep the generic code */ }
    throw new Error(code);
  }
  return response.blob();
}

export function documentError(code: string): string {
  return code === "pdf_renderer_unavailable" ? "The PDF service is starting up. Try again in a minute."
    : code === "unauthorized" ? "Sign in again to download your documents."
      : "The PDF could not be created. Please try again.";
}

/** The panel's title and next step for a report. */
export function atsHeadline(report: AtsReport | null): { title: string; hint: string } {
  if (!report || report.score === null) return { title: "ATS check", hint: "How an applicant tracking system reads your profile against this job." };
  const missing = report.rows.find(row => row.key === "keywords")?.missing.length ?? 0;
  const hint = missing ? "Add the missing keywords you really have to raise your score." : "Your tailored CV covers every keyword this job lists.";
  const title = report.score >= 8 ? "Your profile is a strong match"
    : report.score >= 6.5 ? "Your profile is a good match — almost there"
      : report.score >= 4.5 ? "Your profile is a fair match" : "Your profile is missing key requirements";
  return { title, hint };
}

const storageKey = (jobId: string) => `ats-keywords:${jobId}`;

/** Keywords the student added for this job, kept in this browser only. */
export function loadKeywords(jobId: string): string[] {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(storageKey(jobId)) ?? "[]");
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string").reduce(addKeyword, [] as string[]) : [];
  } catch { return []; }
}

export function saveKeywords(jobId: string, keywords: string[]) {
  try {
    if (keywords.length) globalThis.localStorage?.setItem(storageKey(jobId), JSON.stringify(keywords));
    else globalThis.localStorage?.removeItem(storageKey(jobId));
  } catch { /* storage blocked: keywords last for this visit */ }
}
