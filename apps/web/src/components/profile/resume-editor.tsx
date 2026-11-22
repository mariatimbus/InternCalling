"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveResumeLink } from "@/app/(workspace)/profile/resume-actions";
import { safeResumeUrl, validateResumeUrl } from "@/lib/resume-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";

export function ResumeEditor({ initialResumeUrl }: { initialResumeUrl: string | null }) {
  const [saved, setSaved] = useState(initialResumeUrl);
  const [draft, setDraft] = useState(initialResumeUrl ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const safe = safeResumeUrl(saved);
  const present = !!saved?.trim();

  function edit(remove = false) {
    setDraft(remove ? "" : saved ?? ""); setError(""); setSuccess(""); setEditing(true);
  }
  function cancel() {
    if (inFlight.current) return;
    setDraft(saved ?? ""); setEditing(false); setError(""); heading.current?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const validated = validateResumeUrl(draft);
    setError(""); setSuccess("");
    if (validated.error) { setError(validated.error); input.current?.focus(); return; }
    inFlight.current = true; setPending(true);
    try {
      const result = await saveResumeLink(validated.resumeUrl);
      if (Object.hasOwn(result, "resumeUrl") && !result.error) {
        const confirmed = result.resumeUrl ?? null;
        setSaved(confirmed); setDraft(confirmed ?? ""); setEditing(false);
        setSuccess(result.success ?? "Resume link saved."); heading.current?.focus();
      } else setError(result.error ?? "The saved link could not be confirmed. Try Save again.");
    } catch { setError("We could not confirm the link was saved. Check your connection and try Save again. Your entered value is still here."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby="resume-title">
    <h2 id="resume-title" ref={heading} tabIndex={-1} className="section-title">Resume</h2>
    <p className="reading-text mt-3">Store a link to your resume. Access permissions are managed by the hosting service. We do not check whether the file is accessible.</p>
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
    {editing ? <form className="mt-5 space-y-4" noValidate aria-busy={pending} onSubmit={submit}>
      <Input ref={input} label="Resume URL" name="resume_url" type="url" inputMode="url" autoComplete="off" maxLength={512} value={draft} disabled={pending} error={error || undefined} hint="Use a full HTTP or HTTPS link without login credentials. Leave blank and Save to remove it." onChange={(event) => { setDraft(event.target.value); setError(""); }} />
      {error && <ErrorState variant="danger" title="Resume link could not be saved" description={error} />}
      {pending && <p role="status" className="text-sm">Saving resume link...</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
    </form> : <div className="mt-5 space-y-4">
      {!present ? <p className="text-sm text-muted">No resume link added</p> : safe ? <div className="space-y-2"><p className="text-sm">Resume link added</p><a href={safe} target="_blank" rel="noopener noreferrer" className="inline-block rounded-control py-2 text-sm text-accent underline underline-offset-4">Open resume<span className="sr-only"> (opens in a new tab)</span></a></div> : <div role="alert" className="text-sm leading-6">The saved value is not a safe HTTP/HTTPS resume link. Replace or remove it; it will not be opened.</div>}
      <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => edit()}>{present ? "Replace link" : "Add resume link"}</Button>{saved !== null && <Button variant="ghost" onClick={() => edit(true)}>Remove link</Button>}</div>
    </div>}
    <div className="mt-6 border-t border-border pt-5"><h3 className="card-title">Future resume tools</h3><p className="mt-2 metadata-text">Upload, parsing and tailoring: Not available yet.</p><p className="mt-2 metadata-text">This feature stores a link only. Your resume is not uploaded, parsed, analyzed or used in matching. Resume links do not count toward Profile Completion.</p></div>
  </section>;
}
