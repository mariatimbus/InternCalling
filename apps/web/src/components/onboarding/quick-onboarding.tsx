"use client";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { finishOnboarding } from "@/app/auth/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { prefillOnboarding, type OnboardingDraft } from "@/lib/onboarding";
import { createProfileServices } from "@/lib/profile-services";
import { validateResumeSelection, type ResumeMetadata } from "@/lib/resume-pdf";
import { isParsingJob, isParsingResult } from "@/lib/resume-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});
const textFields = [["university", "University"], ["field_of_study", "Field of study"], ["graduation_year", "Graduation year"], ["location", "City"]] as const;

/** One screen: an optional CV fills the form, one button saves it and opens the internships. */
export function QuickOnboarding({ initial, suggestions }: { initial: OnboardingDraft; suggestions: string[] }) {
  const services = useMemo(() => createProfileServices(), []), listId = useId(), fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial), [skill, setSkill] = useState("");
  const [resume, setResume] = useState<ResumeMetadata | null>(null), [reading, setReading] = useState(false), [note, setNote] = useState("");
  const [state, action, pending] = useActionState(finishOnboarding, {} as ActionState);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const operation = new AbortController(); lifetime.current = operation;
    services.pdf.load({ signal: operation.signal }).then(value => { if (!operation.signal.aborted) setResume(value); }).catch(() => {});
    return () => operation.abort();
  }, [services]);

  async function readCv(file: File | null) {
    const signal = lifetime.current?.signal; if (!signal || reading) return;
    if (file) { const check = validateResumeSelection([file]); if (check.error) { setNote(check.error); return; } }
    setReading(true); setNote("Reading your CV…");
    try {
      let source = resume;
      if (file) { source = await services.pdf.upload(file, { replace: resume && { id: resume.id, revision: resume.revision }, signal, onProgress: () => {} }); setResume(source); }
      if (!source) return;
      let job = await services.review.start({ id: source.id, revision: source.revision }, { signal });
      for (let attempt = 0; isParsingJob(job) && ["queued", "processing"].includes(job.status) && attempt < 40; attempt++) { await sleep(500, signal); job = await services.review.status(job.id, { signal }); }
      if (!isParsingJob(job) || job.status !== "ready") throw new Error("not ready");
      const result = await services.review.result(job.id, { signal });
      if (!isParsingResult(result)) throw new Error("invalid result");
      setDraft(current => prefillOnboarding(current, result.proposed));
      setNote("Filled in from your CV. Fix anything that looks wrong.");
    } catch { if (!signal.aborted) setNote("We couldn't read this CV. Fill in the details below."); }
    finally { if (!signal.aborted) setReading(false); }
  }
  function addSkill() {
    const name = skill.trim().toLowerCase();
    if (name && name.length <= 100 && draft.skills.length < 100) setDraft({ ...draft, skills: [...new Set([...draft.skills, name])] });
    setSkill("");
  }

  return <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-1 sm:pt-4"><section className="rounded-panel bg-card p-5 sm:p-8">
    <h1 className="text-3xl font-semibold tracking-tight">Set up your profile</h1>
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="CV PDF" className="sr-only" onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void readCv(file); }} />
      <Button disabled={reading || pending} onClick={() => fileInput.current?.click()}>{reading ? "Reading your CV…" : "Upload CV (PDF)"}</Button>
      {resume && !reading && <Button variant="secondary" disabled={pending} onClick={() => { void readCv(null); }}>Use {resume.fileName}</Button>}
      <p role="status" className="text-sm text-muted">{note || "We fill in the form for you. Or type it yourself."}</p>
    </div>
    <form action={action} className="mt-5 space-y-4 border-t border-border pt-5">
      <input type="hidden" name="skills" value={JSON.stringify(draft.skills)} />
      <fieldset><legend className="mb-2 text-sm font-medium">Degree</legend><div className="flex flex-wrap gap-3">{([["bachelor", "Bachelor's"], ["master", "Master's"]] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-sm ${draft.degree_level === value ? "border-accent bg-primary/15" : "border-border"}`}><input type="radio" name="degree_level" value={value} checked={draft.degree_level === value} onChange={() => setDraft({ ...draft, degree_level: value })} className="accent-primary" />{label}</label>)}</div>{state.fields?.degree_level && <p role="alert" className="mt-2 text-sm">{state.fields.degree_level}</p>}</fieldset>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">{textFields.map(([key, label]) => <Input key={key} wrapperClassName={key === "university" || key === "field_of_study" ? "col-span-2 sm:col-span-1" : undefined} label={label} name={key} value={draft[key]} required maxLength={255} error={state.fields?.[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} {...(key === "graduation_year" ? { type: "number", min: 1900, max: 2100, inputMode: "numeric" as const } : key === "location" ? { autoComplete: "address-level2" } : { autoComplete: "off" })} />)}</div>
      <div>
        <Input label="Skills (optional)" list={listId} value={skill} maxLength={100} placeholder="Type a skill and press Enter" onChange={event => setSkill(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} />
        <datalist id={listId}>{suggestions.map(name => <option key={name} value={name} />)}</datalist>
        {draft.skills.length > 0 && <ul aria-label="Your skills" className="mt-3 flex flex-wrap gap-2">{draft.skills.map(name => <li key={name}><Button variant="secondary" size="sm" onClick={() => setDraft({ ...draft, skills: draft.skills.filter(item => item !== name) })} aria-label={`Remove ${name}`}>{name}<span aria-hidden="true"> ×</span></Button></li>)}</ul>}
      </div>
      {state.error && <p role="alert" className="text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending || reading}>{pending ? "Saving…" : "Show my internships"}</Button>
    </form>
  </section></div>;
}
