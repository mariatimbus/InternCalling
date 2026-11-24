"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ResumePdfController, initialResumePdfState, type ResumePdfState } from "@/lib/resume-pdf-controller";
import { resumeFileSize, type ResumePdfService } from "@/lib/resume-pdf";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
export function ResumePdfSection({ service, preview = false, children, linkInitiallyOpen = false, onStateChange, selectionLocked = false, parsingAvailable = false, uploadAvailable = true }: { service?: ResumePdfService; preview?: boolean; children?: ReactNode; linkInitiallyOpen?: boolean; onStateChange?:(state:ResumePdfState)=>void; selectionLocked?:boolean; parsingAvailable?:boolean; uploadAvailable?:boolean }) {
  const id = useId(), controller = useRef<ResumePdfController | null>(null);
  const [state, setState] = useState(() => initialResumePdfState(!!service));
  const input = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null), accessLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const current = new ResumePdfController(service, preview); controller.current = current;
    const unsubscribe = current.subscribe(next=>{setState(next);onStateChange?.(next);}); void current.load();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [service, preview, onStateChange]);
  useEffect(() => { if (state.deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [state.deleting]);
  useEffect(() => { if (state.access) accessLink.current?.focus(); }, [state.access]);
  useEffect(() => { if (!state.busy && state.notice && !state.access) heading.current?.focus(); }, [state.busy, state.notice, state.access]);
  const busy = !!state.busy, known = state.status === "ready", confirmed = state.confirmed;
  const focusHeading = () => heading.current?.focus();
  return <section aria-labelledby={id + "-title"} className="mt-8 min-w-0 rounded-panel bg-card p-6 sm:p-9" aria-busy={busy || state.status === "loading"}>
    <h2 ref={heading} tabIndex={-1} id={id + "-title"} className="section-title">Resume PDF</h2>
    <p id={id + "-help"} className="mt-3 text-sm leading-6 text-muted">Choose one non-empty PDF, up to 5 MiB. These preliminary checks do not verify file contents or malware safety. {parsingAvailable?"You will review proposed information before confirming any profile changes.":"PDFs are not parsed, analyzed or used in matching."}</p>
    {!parsingAvailable&&<p className="mt-3 text-sm text-muted">Resume parsing is not available yet. You can continue editing your profile manually.</p>}
    {service && !uploadAvailable && <p role="status" className="mt-3 text-sm text-muted">PDF storage is currently unavailable. You can continue editing your profile manually.</p>}
    {!service && <p role="status" className="mt-3 text-sm text-muted">PDF upload is not available yet. You can select a file for preliminary checks or use a resume link instead.</p>}
    {preview && <p className="mt-3 text-sm text-muted">Simulated uploads only. No network transfer occurs; progress stays indeterminate.</p>}
    {state.status === "loading" && <p role="status" className="mt-4 text-sm">Loading current resume status...</p>}
    {state.status === "unavailable" && <div className="mt-4"><p className="text-sm text-muted">Current resume status is unavailable. Any previous metadata below is the last confirmed state.</p><Button variant="secondary" disabled={busy} onClick={() => { void controller.current?.load(); }}>Retry resume status</Button></div>}
    <div className="mt-5 space-y-3">
      <label htmlFor={id + "-file"} className="block text-sm font-medium">{confirmed ? "Select replacement PDF" : "Select PDF"}</label>
      <input ref={input} id={id + "-file"} type="file" accept=".pdf,application/pdf" disabled={busy || state.deleting || selectionLocked || !uploadAvailable} aria-describedby={id + "-help"} className="block min-h-11 w-full min-w-0 rounded-control border border-border text-sm text-muted file:mr-3 file:min-h-11 file:rounded-control file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-on-primary disabled:opacity-50" onChange={event => { const files = Array.from(event.target.files ?? []); controller.current?.select(files); event.target.value = ""; }} />
      {state.selected && <div className="space-y-2"><p className="break-words text-sm">Selected locally: {state.selected.name} ({resumeFileSize(state.selected.size)})</p>{state.warning && <p role="status" className="text-xs leading-6 text-muted">{state.warning}</p>}<div className="flex flex-wrap gap-3"><Button disabled={!service || !uploadAvailable || !known || busy || state.deleting || selectionLocked} onClick={() => { void controller.current?.upload(); }}>{!service ? "Upload unavailable" : confirmed ? "Replace PDF" : "Upload PDF"}</Button><Button variant="secondary" disabled={busy || selectionLocked} onClick={() => input.current?.click()}>Choose a different PDF</Button><Button variant="ghost" disabled={busy} onClick={() => { controller.current?.clearSelection(); input.current?.focus(); }}>Cancel selection</Button></div></div>}
    </div>
    {state.busy === "upload" && <div className="mt-5 space-y-3"><p role="status" className="text-sm">{preview ? "Simulating PDF upload..." : "Uploading PDF..."}</p><progress aria-label={preview ? "Simulated upload pending" : "PDF bytes transferred"} max={100} value={state.progress ?? undefined} className="h-2 w-full accent-primary" />{state.progress !== null && <p className="metadata-text">{state.progress}% transferred. Waiting for confirmation.</p>}<Button variant="secondary" onClick={() => controller.current?.cancelUpload()}>Cancel upload</Button></div>}
    {state.busy === "cancelling" && <p role="status" className="mt-4 text-sm">Stopping upload and checking its final status...</p>}
    {state.busy === "remove" && <p role="status" className="mt-4 text-sm">Removing PDF...</p>}
    {state.busy === "access" && <p role="status" className="mt-4 text-sm">Preparing access link...</p>}
    {confirmed ? <div className="mt-6 space-y-3 border-t border-border pt-5"><h3 className="card-title">{preview ? "Simulated uploaded PDF" : "Confirmed uploaded PDF"}</h3><p className="break-words text-sm">{confirmed.fileName} ({resumeFileSize(confirmed.sizeBytes)})</p><p className="metadata-text">{preview ? "Temporary preview metadata" : "Uploaded"}: {confirmed.uploadedAt}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={!known || busy || state.deleting} onClick={() => { void controller.current?.open("view"); }}>View PDF</Button><Button variant="secondary" disabled={!known || busy || state.deleting} onClick={() => { void controller.current?.open("download"); }}>Download PDF</Button><Button variant="ghost" disabled={!known || busy || state.deleting || selectionLocked} onClick={() => controller.current?.requestDelete()}>Remove PDF</Button></div></div> : known && <p className="mt-5 text-sm text-muted">No PDF uploaded</p>}
    {state.access && <div className="mt-4 space-y-2"><p className="metadata-text">{state.access.value.kind === "local-preview" ? "Local preview link only; it is not a stored or signed URL." : state.access.value.kind === "authenticated" ? "Private copy fetched using your signed-in session. The link is released when you leave this view." : "Temporary access link. Request a new link if it expires."}</p><a ref={accessLink} href={state.access.value.url} target="_blank" rel="noopener noreferrer" download={state.access.intent === "download" && state.access.value.kind !== "authorized" ? confirmed?.fileName : undefined} className="inline-block max-w-full rounded-control py-2 text-sm text-accent underline">{state.access.intent === "download" ? "Download ready PDF" : "Open ready PDF"}<span className="sr-only"> (opens in a new tab)</span></a></div>}
    {state.deleting && <div ref={confirmation} role="group" aria-label="Confirm PDF deletion" className="mt-5 rounded-card border border-border p-4" onKeyDown={event => { if (event.key === "Escape" && !busy) { controller.current?.keepResume(); focusHeading(); } }}><p className="text-sm">Remove the confirmed PDF? Your resume link is unaffected.</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => { controller.current?.keepResume(); focusHeading(); }}>Keep PDF</Button><Button disabled={busy} onClick={() => { void controller.current?.remove().then(focusHeading); }}>Confirm remove PDF</Button></div></div>}
    {state.error && <div className="mt-4"><ErrorState variant="danger" title="Resume PDF action needs attention" description={state.error} /></div>}
    {state.notice && <p role="status" className="mt-4 text-sm leading-6">{state.notice}</p>}
    {service && <Button className="mt-4" variant="ghost" disabled={busy || state.deleting || selectionLocked} onClick={() => { void controller.current?.load(); }}>Refresh PDF status</Button>}
    {children && <details open={linkInitiallyOpen || undefined} className="mt-6 border-t border-border pt-5"><summary className="cursor-pointer rounded-control py-2 text-sm text-accent">Use a link instead</summary>{children}</details>}
  </section>;
}
