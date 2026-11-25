"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  addKeyword, atsHeadline, checkAts, documentError, loadKeywords, saveKeywords, tailoredPdf, MAX_KEYWORD_LENGTH,
  type AtsReport, type AtsStatus, type DocumentKind,
} from "@/lib/ats";

const statusText: Record<AtsStatus, string> = { met: "Met", partial: "Partly met", missing: "Missing", not_stated: "Not stated in the posting" };

function StatusMark({ status }: { status: AtsStatus }) {
  const tone = status === "met" ? "bg-success-border text-surface" : status === "partial" ? "bg-primary text-surface"
    : status === "missing" ? "bg-danger-border text-surface" : "border border-border text-muted";
  return <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${tone}`} title={statusText[status]}>
    {status === "missing" ? <Icon name="x" className="size-3" /> : status === "not_stated" ? <span aria-hidden="true" className="text-xs leading-none">–</span> : <Icon name="check" className="size-3" />}
    <span className="sr-only">{statusText[status]}</span>
  </span>;
}

/** Half-circle gauge of the 0–10 ATS score. */
function Gauge({ score, label }: { score: number | null; label: string }) {
  const share = score === null ? 0 : Math.max(0, Math.min(1, score / 10));
  const tone = score === null ? "text-border" : score >= 6.5 ? "text-success-border" : score >= 4.5 ? "text-primary" : "text-danger-border";
  return <div className="flex w-28 shrink-0 flex-col items-center">
    <div className="relative h-16 w-28" aria-hidden="true">
      <svg viewBox="0 0 100 56" className="size-full">
        <path d="M8 50a42 42 0 0 1 84 0" fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-current text-border" />
        <path d="M8 50a42 42 0 0 1 84 0" fill="none" strokeWidth="7" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${share * 100} 100`} className={`stroke-current ${tone} motion-safe:transition-[stroke-dasharray] motion-safe:duration-500`} />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center text-2xl font-semibold tabular-nums text-foreground">{score === null ? "–" : score.toFixed(1)}</span>
    </div>
    <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
  </div>;
}

/** ATS-style check of the student's profile against one job, with tailored CV and cover letter PDFs. */
export function AtsPanel({ jobId, transport }: { jobId: string; transport?: typeof fetch }) {
  const [keywords, setKeywords] = useState<string[]>(() => loadKeywords(jobId));
  const [typed, setTyped] = useState("");
  const [report, setReport] = useState<AtsReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    saveKeywords(jobId, keywords);
    checkAts(jobId, keywords, transport).then(
      value => { if (live) { setReport(value); setFailed(false); } },
      () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [jobId, keywords, transport]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setKeywords(current => addKeyword(current, typed));
    setTyped("");
  }

  async function download(kind: DocumentKind) {
    setBusy(kind); setMessage("");
    try {
      const url = URL.createObjectURL(await tailoredPdf(jobId, kind, keywords, transport));
      const link = Object.assign(document.createElement("a"), { href: url, download: `${kind}.pdf` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(kind === "resume" ? "Your tailored CV is downloading." : "Your cover letter is downloading.");
    } catch (error) {
      setMessage(documentError(error instanceof Error ? error.message : ""));
    } finally { setBusy(null); }
  }

  const keywordRow = report?.rows.find(row => row.key === "keywords");
  const otherRows = report?.rows.filter(row => row.key !== "keywords") ?? [];
  const own = new Set(keywords.map(k => k.toLowerCase()));
  const headline = atsHeadline(report);
  const total = keywordRow ? keywordRow.matched.length + keywordRow.missing.length : 0;

  return <section aria-labelledby={`ats-${jobId}`} className="rounded-panel border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center gap-5">
      <Gauge score={report?.score ?? null} label={report ? report.label : "ATS score"} />
      <div className="min-w-0 flex-[1_1_14rem]">
        <h3 id={`ats-${jobId}`} className="text-lg font-semibold leading-snug text-foreground">{headline.title}</h3>
        <p className="mt-1 text-sm text-muted">{headline.hint}</p>
      </div>
    </div>

    {failed ? <p role="alert" className="mt-5 text-sm">The ATS check could not be loaded. Close and reopen this panel to retry.</p>
      : !report ? <p role="status" className="mt-5 text-sm text-muted">Reading the job posting…</p>
        : <>
          <dl className="mt-5 border-t border-line">
            <div className="hidden grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line py-2 text-xs font-medium text-muted sm:grid" aria-hidden="true">
              <span>Overview</span><span>This job</span><span>Your profile</span>
            </div>
            {otherRows.map(row => <div key={row.key} className="grid gap-x-4 gap-y-1 border-b border-line py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)]">
              <dt className="flex items-center gap-2 font-medium text-foreground"><StatusMark status={row.status} />{row.label}</dt>
              <dd className="min-w-0 break-words text-foreground"><span className="text-muted sm:hidden">This job: </span>{row.job}</dd>
              <dd className="min-w-0 break-words text-foreground"><span className="text-muted sm:hidden">You: </span>{row.you}</dd>
            </div>)}
          </dl>

          {keywordRow && <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-foreground">ATS keywords</h4>
              <span className="text-sm tabular-nums text-muted"><strong className="font-semibold text-foreground">{keywordRow.matched.length}</strong> of {total} found</span>
              <span aria-hidden="true" className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-success-border" style={{ width: `${total ? (100 * keywordRow.matched.length) / total : 0}%` }} />
              </span>
            </div>
            {keywordRow.matched.length > 0 && <div>
              <p className="mb-2 text-xs font-medium text-muted">In your profile</p>
              <ul aria-label="Keywords in your profile" className="flex flex-wrap gap-1.5">
                {keywordRow.matched.map(keyword => <li key={keyword} className="inline-flex items-center gap-1 rounded-full border border-success-border/30 bg-success-surface px-2.5 py-1 text-xs font-medium text-success-foreground">
                  <Icon name="check" className="size-3" />{keyword}
                  {own.has(keyword.toLowerCase()) && <button type="button" onClick={() => setKeywords(keywords.filter(k => k.toLowerCase() !== keyword.toLowerCase()))}
                    aria-label={`Remove keyword ${keyword}`} className="-me-1 rounded-full p-0.5 hover:bg-success-border/15 focus-visible:outline-2 focus-visible:outline-focus">
                    <Icon name="x" className="size-3" /></button>}
                </li>)}
              </ul>
            </div>}
            {keywordRow.missing.length > 0 && <div>
              <p className="mb-2 text-xs font-medium text-muted">Missing — add the ones you have</p>
              <ul aria-label="Missing keywords" className="flex flex-wrap gap-1.5">
                {keywordRow.missing.map(keyword => <li key={keyword}>
                  <button type="button" onClick={() => setKeywords(current => addKeyword(current, keyword))} aria-label={`Add keyword ${keyword}`}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-focus">
                    <Icon name="plus" className="size-3" />{keyword}</button>
                </li>)}
              </ul>
            </div>}
            <form onSubmit={submit} className="flex items-end gap-2">
              <Input label="Add your own keyword" wrapperClassName="min-w-0 flex-1" value={typed} maxLength={MAX_KEYWORD_LENGTH}
                placeholder="e.g. Kubernetes" onChange={event => setTyped(event.target.value)} />
              <Button type="submit" variant="secondary" disabled={!typed.trim()}><Icon name="plus" className="size-4" />Add</Button>
            </form>
            <p className="text-xs text-muted">Keywords you add count as yours and go into the Skills of your tailored CV. Only add what you can show.</p>
          </div>}
        </>}

    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
      <Button onClick={() => download("resume")} disabled={busy !== null}>
        <Icon name="resume" className="size-4" />{busy === "resume" ? "Writing your CV…" : "Download tailored CV"}</Button>
      <Button variant="secondary" onClick={() => download("cover-letter")} disabled={busy !== null}>
        <Icon name="applications" className="size-4" />{busy === "cover-letter" ? "Writing your letter…" : "Download cover letter"}</Button>
      <p role="status" className="basis-full text-sm text-muted empty:hidden">{message || (busy ? "PDF, written for this job. This can take up to a minute." : "")}</p>
    </div>
  </section>;
}
