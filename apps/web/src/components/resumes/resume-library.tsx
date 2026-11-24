"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProfileServices, type WorkspaceCapabilities } from "@/lib/profile-services";
import { ResumePdfController, initialResumePdfState } from "@/lib/resume-pdf-controller";
import { resumeFileSize } from "@/lib/resume-pdf";
import { ResumeReviewFlow } from "@/components/profile/resume-review-flow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

function resumeDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Manages the existing private PDF; the controller owns mutations and access lifetimes. */
export function ResumeLibrary() {
  const router = useRouter();
  const services = useMemo(() => createProfileServices(), []);
  const [state, setState] = useState(() => initialResumePdfState(true));
  const [capabilities, setCapabilities] = useState<WorkspaceCapabilities | null>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const controller = useRef<ResumePdfController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const access = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const current = new ResumePdfController(services.pdf);
    controller.current = current;
    const unsubscribe = current.subscribe(setState);
    void current.load();
    const operation = new AbortController();
    void services.capabilities(operation.signal).then(value => {
      if (!operation.signal.aborted) setCapabilities(value);
    }).catch(() => { if (!operation.signal.aborted) setCapabilities(null); });
    return () => { operation.abort(); unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [services]);
  useEffect(() => { if (uploadOpen) picker.current?.focus(); }, [uploadOpen]);
  useEffect(() => { if (state.deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [state.deleting]);
  useEffect(() => { if (state.access) access.current?.focus(); }, [state.access]);
  useEffect(() => { if (state.notice && !state.busy && !state.selected) heading.current?.focus(); }, [state.notice, state.busy, state.selected]);
  const saved = state.confirmed;
  const known = state.status === "ready";
  const busy = !!state.busy;
  const mutationDisabled = !known || busy || state.deleting;
  function openUpload() { menu.current?.removeAttribute("open"); setUploadOpen(true); }
  function act(action: () => void) { menu.current?.removeAttribute("open"); action(); }
  const source = known && saved && !state.selected && !busy && !state.deleting ? { id: saved.id, revision: saved.revision } : null;

  return <>
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><h1 ref={heading} tabIndex={-1} className="page-title">Resumes</h1><p className="reading-text mt-3">Keep your resume ready for your next opportunity.</p></div>
      <Button disabled={mutationDisabled || !capabilities?.upload} onClick={openUpload}><Icon name="plus" />{saved ? "Replace resume" : "Add resume"}</Button>
    </header>
    <p role="status" className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
      <Icon name="resume" className="text-accent" />
      {known ? `You have ${saved ? "1 resume" : "0 resumes"} saved.` : state.status === "loading" ? "Loading your resumes…" : "Saved resume status could not be loaded."}
    </p>
    {uploadOpen && <section aria-labelledby="resume-upload-title" className="mb-5 rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="resume-upload-title" className="section-title">{saved ? "Replace your resume" : "Add your resume"}</h2>
      <p id="resume-upload-help" className="mt-2 text-sm text-muted">Choose a PDF up to 5 MiB.{saved && " Uploading a replacement will replace your current PDF."}</p>
      <form className="mt-5 space-y-4" onSubmit={event => {
        event.preventDefault();
        void controller.current?.upload().then(() => {
          if (controller.current?.state.confirmed && !controller.current.state.selected) setUploadOpen(false);
        });
      }}>
        <div className="space-y-2"><label htmlFor="resume-library-file" className="block text-sm font-medium">Select PDF</label>
          <input ref={picker} id="resume-library-file" type="file" accept=".pdf,application/pdf" aria-describedby="resume-upload-help" disabled={mutationDisabled || !capabilities?.upload}
            className="block min-h-11 w-full min-w-0 rounded-control border border-border text-sm text-muted file:me-3 file:min-h-11 file:border-0 file:bg-elevated file:px-4 file:font-medium file:text-foreground disabled:opacity-50"
            onChange={event => { controller.current?.select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        </div>
        {state.selected && <p className="break-words text-sm">{state.selected.name} ({resumeFileSize(state.selected.size)})</p>}
        {state.warning && <p className="text-sm text-muted">{state.warning}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={mutationDisabled || !capabilities?.upload || !state.selected}>{saved ? "Replace PDF" : "Upload PDF"}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { controller.current?.clearSelection(); setUploadOpen(false); heading.current?.focus(); }}>Cancel</Button></div>
      </form>
    </section>}
    <section aria-label="Saved resumes" aria-busy={state.status === "loading" || busy} className="min-w-0 rounded-card border border-line bg-surface px-4 py-2 sm:px-6">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Your saved resume and private file actions</caption>
        <thead><tr className="border-b border-line text-xs text-foreground">
          <th scope="col" className="py-5 pe-3 font-semibold md:w-[43%]">Resume</th>
          <th scope="col" className="hidden px-3 py-5 font-semibold md:table-cell md:w-[18%]">Target job title</th>
          <th scope="col" className="hidden px-3 py-5 font-semibold md:table-cell md:w-[16%]">Last modified</th>
          <th scope="col" className="hidden px-3 py-5 font-semibold md:table-cell md:w-[15%]">Created</th>
          <th scope="col" className="w-12 py-5 text-right"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>{saved ? <tr className="border-b border-line align-top">
          <th scope="row" className="py-6 pe-3 font-normal"><div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-accent"><Icon name="resume" /></span>
            <div className="min-w-0"><p className="truncate font-semibold text-foreground" title={saved.fileName}>{saved.fileName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="accent">Uploaded</Badge><span className="metadata-text">{resumeFileSize(saved.sizeBytes)}</span></div>
              <p className="metadata-text mt-2 md:hidden">Uploaded <time dateTime={saved.uploadedAt}>{resumeDate(saved.uploadedAt)}</time></p>
            </div></div></th>
          <td className="hidden px-3 py-6 text-muted md:table-cell">Not specified</td>
          <td className="hidden px-3 py-6 text-muted md:table-cell"><time dateTime={saved.uploadedAt}>{resumeDate(saved.uploadedAt)}</time></td>
          <td className="hidden px-3 py-6 text-muted md:table-cell"><time dateTime={saved.uploadedAt}>{resumeDate(saved.uploadedAt)}</time></td>
          <td className="py-5 text-right"><details ref={menu} className="relative" onKeyDown={event => { if (event.key === "Escape") { menu.current?.removeAttribute("open"); menu.current?.querySelector("summary")?.focus(); } }}>
            <summary aria-label={`Actions for ${saved.fileName}`} className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-control text-muted hover:bg-elevated"><Icon name="more" /></summary>
            <div className="absolute end-0 top-full z-20 grid min-w-44 gap-1 rounded-control border border-border bg-surface p-2 text-left">
              <Button variant="ghost" disabled={mutationDisabled} onClick={() => act(() => { void controller.current?.open("view"); })}>View PDF</Button>
              <Button variant="ghost" disabled={mutationDisabled} onClick={() => act(() => { void controller.current?.open("download"); })}>Download PDF</Button>
              <Button variant="ghost" disabled={mutationDisabled || !capabilities?.upload} onClick={openUpload}>Replace PDF</Button>
              <Button variant="ghost" disabled={mutationDisabled} onClick={() => act(() => controller.current?.requestDelete())}>Remove PDF</Button>
            </div>
          </details></td>
        </tr> : <tr><td colSpan={5} className="py-16 text-center">
          {known ? <><span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-card bg-elevated text-accent"><Icon name="resume" /></span><h2 className="section-title">No resumes yet</h2><p className="reading-text mt-2">Add your PDF to keep it ready for applications.</p></>
            : <p role="status" className="reading-text">{state.status === "loading" ? "Loading saved resume…" : "We could not confirm your saved resume. Try again."}</p>}
        </td></tr>}</tbody>
      </table>
      {saved && <div className="min-h-24" aria-hidden="true" />}
    </section>
    {state.status === "unavailable" && <div className="mt-4"><Button variant="secondary" disabled={busy} onClick={() => { void controller.current?.load(); }}>Retry resume status</Button></div>}
    {state.deleting && <div ref={confirmation} role="group" aria-label="Confirm PDF deletion" className="mt-5 rounded-card border border-border bg-surface p-5">
      <h2 className="card-title">Remove this resume?</h2><p className="reading-text mt-2">This removes the saved PDF. Your profile details stay saved.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { controller.current?.keepResume(); heading.current?.focus(); }}>Keep PDF</Button><Button disabled={busy} onClick={() => { void controller.current?.remove(); }}>Confirm remove PDF</Button></div>
    </div>}
    {busy && <div className="mt-4 space-y-3"><p role="status" className="text-sm">{state.busy === "upload" ? "Uploading PDF…" : state.busy === "cancelling" ? "Checking the final upload status…" : state.busy === "remove" ? "Removing PDF…" : "Preparing your private PDF…"}</p>
      {state.busy === "upload" && <><progress aria-label="PDF bytes transferred" max={100} value={state.progress ?? undefined} className="h-2 w-full accent-primary" /><Button variant="secondary" onClick={() => controller.current?.cancelUpload()}>Cancel upload</Button></>}
    </div>}
    {state.access && <a ref={access} href={state.access.value.url} target="_blank" rel="noopener noreferrer" download={state.access.intent === "download" && state.access.value.kind !== "authorized" ? saved?.fileName : undefined} className="mt-4 inline-flex min-h-11 items-center rounded-control text-sm font-medium text-accent underline">{state.access.intent === "download" ? "Download ready PDF" : "Open ready PDF"}<span className="sr-only"> (opens in a new tab)</span></a>}
    {state.error && <p role="alert" className="mt-4 rounded-control border border-danger-border bg-danger-surface p-4 text-sm text-danger-foreground">{state.error}</p>}
    {state.notice && <p role="status" className="mt-4 text-sm">{state.notice}</p>}
    {known && capabilities !== undefined && !capabilities?.upload && <p className="mt-4 text-sm text-muted">PDF uploads are currently unavailable.</p>}
    {source && capabilities?.parsing && <details className="mt-6 border-t border-line pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control text-sm font-medium text-accent">Import details into your profile</summary>
      <ResumeReviewFlow key={`${source.id}:${source.revision}`} service={services.review} source={source} onConfirmed={() => router.refresh()} />
    </details>}
  </>;
}
