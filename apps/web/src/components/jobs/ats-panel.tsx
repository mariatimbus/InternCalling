"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  addKeyword, checkAts, documentError, tailoredPdf, MAX_KEYWORD_LENGTH,
  type AtsReport, type AtsRow, type AtsStatus, type DocumentKind,
} from "@/lib/ats";

const statusText: Record<AtsStatus, string> = { met: "Met", partial: "Partly met", missing: "Missing", not_stated: "Not stated in the posting" };

function StatusMark({ status }: { status: AtsStatus }) {
  const tone = status === "met" ? "bg-success-border text-surface" : status === "partial" ? "bg-primary text-surface"
    : status === "missing" ? "bg-danger-border text-surface" : "border border-border text-muted";
  return <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${tone}`} title={statusText[status]}>
    {status === "missing" ? <Icon name="x" className="size-3" /> : status === "not_stated" ? <span aria-hidden="true" className="text-xs">–</span> : <Icon name="check" className="size-3" />}
    <span className="sr-only">{statusText[status]}</span>
  </span>;
}

/** Half-circle gauge of the 0–10 ATS score. */
function Gauge({ score }: { score: number | null }) {
  const share = score === null ? 0 : Math.max(0, Math.min(1, score / 10));
  const tone = score === null ? "text-border" : score >= 7 ? "text-success-border" : score >= 5 ? "text-primary" : "text-danger-border";
  return <div className="relative h-14 w-24 shrink-0" aria-hidden="true">
    <svg viewBox="0 0 100 56" className="size-full">
      <path d="M8 50a42 42 0 0 1 84 0" fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-current text-border" />
      <path d="M8 50a42 42 0 0 1 84 0" fill="none" strokeWidth="8" strokeLinecap="round" pathLength={100}
        strokeDasharray={`${share * 100} 100`} className={`stroke-current ${tone}`} />
    </svg>
    <span className="absolute inset-x-0 bottom-0 text-center text-xl font-semibold tabular-nums text-foreground">{score === null ? "–" : score.toFixed(1)}</span>
  </div>;
}

function Keywords({ row, added, onRemove }: { row: AtsRow; added: string[]; onRemove: (k: string) => void }) {
  const own = new Set(added.map(k => k.toLowerCase()));
  return <ul aria-label="ATS keywords" className="flex flex-wrap gap-1.5">
    {[...row.matched.map(k => [k, true] as const), ...row.missing.map(k => [k, false] as const)].map(([keyword, found]) =>
      <li key={keyword} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${found
        ? "border-success-border/30 bg-success-surface text-success-foreground" : "border-border text-foreground"}`}>
        {found && <Icon name="check" className="size-3" />}
        <span className={found ? "font-semibold" : ""}>{keyword}</span>
        <span className="sr-only">{found ? " — in your profile" : " — not in your profile"}</span>
        {own.has(keyword.toLowerCase()) && <button type="button" onClick={() => onRemove(keyword)} aria-label={`Remove keyword ${keyword}`}
          className="-me-1 rounded-full p-0.5 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-focus">
          <Icon name="x" className="size-3" /></button>}
      </li>)}
  </ul>;
}

/** ATS-style check of the student's profile against one job, with tailored CV and cover letter PDFs. */
export function AtsPanel({ jobId, transport }: { jobId: string; transport?: typeof fetch }) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [report, setReport] = useState<AtsReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<DocumentKind | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
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

  return <section aria-labelledby={`ats-${jobId}`} className="space-y-4 rounded-panel border border-border p-4">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 id={`ats-${jobId}`} className="card-title">{report ? `Your profile is a ${report.label.toLowerCase()}` : "ATS check"}</h3>
        <p className="mt-1 text-sm text-muted">How an applicant tracking system reads your profile against this job.</p>
      </div>
      <Gauge score={report?.score ?? null} />
    </div>
    {failed ? <p role="alert" className="text-sm">The ATS check could not be loaded. Close and reopen this panel to retry.</p>
      : !report ? <p role="status" className="text-sm text-muted">Checking your profile…</p>
        : <dl className="divide-y divide-line border-y border-line">
          <div className="hidden grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] gap-4 py-2 text-xs text-muted sm:grid" aria-hidden="true">
            <span>Overview</span><span>This job</span><span>Your profile</span>
          </div>
          {report.rows.map(row => <div key={row.key} className={`grid gap-x-4 gap-y-1.5 py-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] ${row.key === "keywords" ? "rounded-control bg-primary/5 px-2 sm:-mx-2" : ""}`}>
            <dt className="flex items-center justify-between gap-2 font-medium text-foreground">{row.label}<StatusMark status={row.status} /></dt>
            {row.key === "keywords"
              ? <dd className="sm:col-span-2">{row.matched.length + row.missing.length > 0
                ? <Keywords row={row} added={keywords} onRemove={k => setKeywords(keywords.filter(x => x.toLowerCase() !== k.toLowerCase()))} />
                : <span className="text-muted">No keywords found. Add the ones you want an ATS to see.</span>}</dd>
              : <>
                <dd className="min-w-0 break-words"><span className="text-muted sm:hidden">This job: </span>{row.job}</dd>
                <dd className="min-w-0 break-words"><span className="text-muted sm:hidden">You: </span>{row.you}</dd>
              </>}
          </div>)}
        </dl>}
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input label="Add a keyword" wrapperClassName="min-w-0 flex-[1_1_14rem]" value={typed} maxLength={MAX_KEYWORD_LENGTH}
        placeholder="e.g. Kubernetes" hint="Keywords you add are checked and put in your tailored CV."
        onChange={event => setTyped(event.target.value)} />
      <Button type="submit" variant="secondary" disabled={!typed.trim()}><Icon name="plus" className="size-4" />Add</Button>
    </form>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => download("resume")} disabled={busy !== null}>
        <Icon name="resume" className="size-4" />{busy === "resume" ? "Writing your CV…" : "Download tailored CV (PDF)"}</Button>
      <Button variant="secondary" onClick={() => download("cover-letter")} disabled={busy !== null}>
        <Icon name="applications" className="size-4" />{busy === "cover-letter" ? "Writing your letter…" : "Download cover letter (PDF)"}</Button>
    </div>
    <p role="status" className="text-sm text-muted">{message || (busy ? "This can take up to a minute." : "")}</p>
  </section>;
}
