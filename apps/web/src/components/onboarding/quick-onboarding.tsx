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
  const services = useMemo(() => createProfileServices(), []), listId = useId(), skillId = useId(), fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial), [skill, setSkill] = useState("");
  const [resume, setResume] = useState<ResumeMetadata | null>(null), [reusable, setReusable] = useState(false), [reading, setReading] = useState(false), [note, setNote] = useState("");
  const [state, action, pending] = useActionState(finishOnboarding, {} as ActionState);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const operation = new AbortController(); lifetime.current = operation;
    services.pdf.load({ signal: operation.signal }).then(value => { if (!operation.signal.aborted) { setResume(value); setReusable(!!value); } }).catch(() => {});
    return () => operation.abort();
  }, [services]);

  async function readCv(file: File | null) {
    const signal = lifetime.current?.signal; if (!signal || reading) return;
    if (file) { const check = validateResumeSelection([file]); if (check.error) { setNote(check.error); return; } }
    setReading(true); setReusable(false); setNote("Reading your CV…");
    let source = resume;
    try {
      if (file) { source = await services.pdf.upload(file, { replace: resume && { id: resume.id, revision: resume.revision }, signal, onProgress: () => {} }); setResume(source); }
      if (!source) return;
      let job = await services.review.start({ id: source.id, revision: source.revision }, { signal });
      for (let attempt = 0; isParsingJob(job) && ["queued", "processing"].includes(job.status) && attempt < 40; attempt++) { await sleep(500, signal); job = await services.review.status(job.id, { signal }); }
      if (!isParsingJob(job) || job.status !== "ready") throw new Error("not ready");
      const result = await services.review.result(job.id, { signal });
      if (!isParsingResult(result)) throw new Error("invalid result");
      setDraft(current => prefillOnboarding(current, result.proposed));
      setNote("Filled in from your CV. Fix anything that looks wrong.");
    } catch { if (!signal.aborted) { setNote("We couldn't read this CV. Fill in the details below."); setReusable(!!source); } }
    finally { if (!signal.aborted) setReading(false); }
  }
  function addSkill() {
    const name = skill.trim().toLowerCase();
    if (name && name.length <= 100 && draft.skills.length < 100) setDraft({ ...draft, skills: [...new Set([...draft.skills, name])] });
    setSkill("");
  }

  return <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-1 sm:pt-4"><section className="rounded-panel bg-card p-4 sm:p-8">
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up your profile</h1>
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-4">
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="CV PDF" className="sr-only" onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void readCv(file); }} />
      <Button disabled={reading || pending} onClick={() => fileInput.current?.click()}>{reading ? "Reading your CV…" : "Upload CV (PDF)"}</Button>
      {reusable && !reading && <Button variant="secondary" disabled={pending} onClick={() => { void readCv(null); }}>Use my uploaded CV</Button>}
      <p role="status" className="text-sm text-muted">{note || "We fill in the form for you. Or type it yourself."}</p>
    </div>
    <form action={action} className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
      <input type="hidden" name="skills" value={JSON.stringify(draft.skills)} />
      <fieldset><legend className="sr-only">Degree</legend><div className="flex flex-wrap gap-3">{([["bachelor", "Bachelor's"], ["master", "Master's"]] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-sm ${draft.degree_level === value ? "border-accent bg-primary/15" : "border-border"}`}><input type="radio" name="degree_level" value={value} checked={draft.degree_level === value} onChange={() => setDraft({ ...draft, degree_level: value })} className="accent-primary" />{label}</label>)}</div>{state.fields?.degree_level && <p role="alert" className="mt-2 text-sm">{state.fields.degree_level}</p>}</fieldset>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">{textFields.map(([key, label]) => <Input key={key} wrapperClassName={key === "university" || key === "field_of_study" ? "col-span-2 sm:col-span-1" : undefined} label={label} name={key} value={draft[key]} required maxLength={255} error={state.fields?.[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} {...(key === "graduation_year" ? { type: "number", min: 1900, max: 2100, inputMode: "numeric" as const } : key === "location" ? { autoComplete: "address-level2" } : { autoComplete: "off" })} />)}</div>
      <div className="min-w-0 space-y-1.5">
        <label htmlFor={skillId} className="metadata-text block font-medium">Skills (optional)</label>
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border border-border bg-background/60 px-2 py-1.5 focus-within:border-focus">
          {draft.skills.map(name => <button key={name} type="button" onClick={() => setDraft({ ...draft, skills: draft.skills.filter(item => item !== name) })} aria-label={`Remove ${name}`} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-elevated px-3 text-xs text-foreground hover:bg-primary/20">{name}<span aria-hidden="true">×</span></button>)}
          <input id={skillId} list={listId} value={skill} maxLength={100} placeholder={draft.skills.length ? "Add a skill" : "Type a skill and press Enter"} onChange={event => setSkill(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } else if (event.key === "Backspace" && !skill && draft.skills.length) setDraft({ ...draft, skills: draft.skills.slice(0, -1) }); }} className="min-h-8 min-w-28 flex-1 bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <datalist id={listId}>{suggestions.map(name => <option key={name} value={name} />)}</datalist>
      </div>
      {state.error && <p role="alert" className="text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending || reading}>{pending ? "Saving…" : "Show my internships"}</Button>
    </form>
  </section></div>;
}
