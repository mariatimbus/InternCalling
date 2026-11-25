"use client";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { finishOnboarding } from "@/app/auth/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { prefillOnboarding, validateSignupOnboarding, type OnboardingDraft } from "@/lib/onboarding";
import { createProfileServices } from "@/lib/profile-services";
import { validateResumeSelection, type ResumeMetadata } from "@/lib/resume-pdf";
import { isParsingJob, isParsingResult, reviewSections, type ParsingResult, type ReviewSection } from "@/lib/resume-review";
import { entryFields, entryLabel, manualEntryDraft, newOnboardingEntry, onboardingChanges, onboardingEntries, sectionLabels, type OnboardingEntry } from "@/lib/onboarding-cv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExperienceDraft } from "@/lib/experience";
import type { ProjectDraft } from "@/lib/projects";
import type { CertificateDraft } from "@/lib/certificates";
import type { HonourDraft } from "@/lib/honours";
import { cefrLevels, type LanguageDraft } from "@/lib/languages";
import type { PublicationDraft } from "@/lib/publications";

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});
const textFields = [["university", "University"], ["field_of_study", "Field of study"], ["graduation_year", "Graduation year"], ["location", "City (optional)"]] as const;
const steps = ["cv", "studies", "skills", ...reviewSections] as const;
const titles: Record<(typeof steps)[number], string> = { cv: "Your CV", studies: "Studies", skills: "Skills", experience: "Experience", projects: "Personal projects", certificates: "Certifications", honours: "Awards", languages: "Languages", publications: "Publications" };

/** CV review and manual entry share the same profile steps. */
export function QuickOnboarding({ initial, suggestions }: { initial: OnboardingDraft; suggestions: string[] }) {
  const services = useMemo(() => createProfileServices(), []), listId = useId(), skillId = useId(), fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial), [skill, setSkill] = useState("");
  const [step, setStep] = useState(0), [pageError, setPageError] = useState("");
  const [resume, setResume] = useState<ResumeMetadata | null>(null), [reusable, setReusable] = useState(false), [reading, setReading] = useState(false), [note, setNote] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  // Experience, projects and the rest found in the CV: ticked entries are saved with the profile.
  const [parsed, setParsed] = useState<{ result: ParsingResult; requestId: string } | null>(null);
  const [entries, setEntries] = useState<OnboardingEntry[]>([]), [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const savedManual = useRef(new Set<string>()), current = steps[step];
  function sectionErrors(section?: ReviewSection) {
    const errors: Record<string, string> = {};
    for (const entry of entries.filter(row => row.include && (!section || row.section === section))) {
      const found = entry.key.startsWith("manual-") ? manualEntryDraft(entry).errors : parsed ? onboardingChanges(parsed.result, [entry], parsed.requestId).errors : {};
      for (const [field, message] of Object.entries(found)) errors[field.startsWith(entry.key) ? field : `${entry.key}.${field}`] = message;
    }
    return errors;
  }
  function next() {
    setPageError("");
    if (current === "studies" || current === "skills") {
      const errors = validateSignupOnboarding(draft);
      const keys = current === "studies" ? ["degree_level", "university", "field_of_study", "graduation_year", "location"] : ["skills"];
      if (keys.some(key => errors[key as keyof OnboardingDraft])) { setPageError("Complete the required fields to continue."); return; }
    }
    if (reviewSections.includes(current as ReviewSection)) {
      const errors = sectionErrors(current as ReviewSection); setEntryErrors(errors);
      if (Object.keys(errors).length) { setPageError("Correct the highlighted entries or deselect them to continue."); return; }
    }
    setStep(value => Math.min(value + 1, steps.length - 1));
  }
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const signal = lifetime.current?.signal;
    const required = validateSignupOnboarding(draft);
    if (Object.keys(required).length) { setStep(required.skills && Object.keys(required).length === 1 ? 2 : 1); return { error: "Complete studies and add at least one skill before continuing.", fields: required }; }
    const invalid = sectionErrors(); setEntryErrors(invalid);
    if (Object.keys(invalid).length) return { error: "Correct the highlighted entries or deselect them before continuing." };
    if (parsed && signal) {
      const { changes, errors } = onboardingChanges(parsed.result, entries.filter(entry => !entry.key.startsWith("manual-")), parsed.requestId);
      setEntryErrors(errors);
      if (Object.keys(errors).length) return { error: "Fix the highlighted CV entries, or untick them." };
      if (changes) {
        try { await services.review.confirm(changes, { signal }); setParsed(null); }
        catch { return { error: "We couldn't save the entries from your CV. Try again, or untick them and add them later in Profile." }; }
      }
    }
    for (const entry of entries.filter(row => row.include && row.key.startsWith("manual-"))) {
      if (savedManual.current.has(entry.key)) continue;
      const { values } = manualEntryDraft(entry);
      try {
        switch (entry.section) {
          case "experience": await services.experience.create(values as ExperienceDraft); break;
          case "projects": await services.projects.create(values as ProjectDraft); break;
          case "certificates": await services.certificates.create(values as CertificateDraft); break;
          case "honours": await services.honours.create(values as HonourDraft); break;
          case "languages": await services.languages.create(values as LanguageDraft); break;
          case "publications": await services.publications.create(values as PublicationDraft); break;
        }
        savedManual.current.add(entry.key);
      } catch { return { error: `We couldn't save ${sectionLabels[entry.section].toLowerCase()}. Please try again.` }; }
    }
    return finishOnboarding(previous, form);
  }, {} as ActionState);
  const updateEntry = (key: string, change: Partial<OnboardingEntry> | ((entry: OnboardingEntry) => OnboardingEntry)) =>
    setEntries(list => list.map(entry => entry.key !== key ? entry : typeof change === "function" ? change(entry) : { ...entry, ...change }));
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
      const found = onboardingEntries(result);
      setParsed({ result, requestId: crypto.randomUUID() }); setEntries(found); setEntryErrors({});
      setNote("Filled in from your CV. Fix anything that looks wrong.");
    } catch { if (!signal.aborted) { setNote("We couldn't read this CV. Fill in the details below."); setReusable(!!source); setParsed(null); setEntries([]); } }
    finally { if (!signal.aborted) setReading(false); }
  }
  function addSkill() {
    const name = skill.trim().toLowerCase();
    if (name && name.length <= 100 && draft.skills.length < 100) setDraft({ ...draft, skills: [...new Set([...draft.skills, name])] });
    setSkill("");
  }

  return <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-12 pt-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:pt-10">
    <aside className="hidden lg:block" aria-label="Profile setup steps"><div className="sticky top-8">
      <p className="text-sm font-semibold text-accent">YOUR PROFILE</p>
      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">A stronger start for every application.</p>
      <p className="mt-2 text-sm leading-6 text-muted">Review what your CV tells us, or add the details yourself. You can change them later in Profile.</p>
      <ol className="mt-8 space-y-1 border-l border-line">{steps.map((key, index) => <li key={key} className={`-ml-px border-l-2 py-2 pl-4 text-sm ${index === step ? "border-primary font-semibold text-foreground" : index < step ? "border-accent text-accent" : "border-transparent text-muted"}`}>{titles[key]}</li>)}</ol>
    </div></aside>
    <section className="rounded-panel border border-border bg-card p-5 sm:p-9 lg:p-10">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-accent">Step {step + 1} of {steps.length}</p><p className="text-xs text-muted">{current === "cv" ? "Recommended" : current === "studies" || current === "skills" ? "Required" : "Optional"}</p></div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true"><div className="h-full bg-primary" style={{ width: `${(step + 1) / steps.length * 100}%` }} /></div>
    <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">{titles[current]}</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{current === "cv" ? "Upload your standard CV and we'll prepare the next steps for you. You'll review every detail before it is saved." : current === "studies" || current === "skills" ? "These details help us find jobs that fit your background." : "Add or review details for your profile. You can skip this section."}</p>
    {current === "cv" && <div className="mt-7 rounded-control border border-border bg-background/60 p-5">
      <p className="mb-4 text-sm font-medium text-foreground">Start with a PDF</p><div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <input ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="CV PDF" className="sr-only" onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void readCv(file); }} />
      <Button disabled={reading || pending} onClick={() => fileInput.current?.click()}>{reading ? "Reading your CV…" : "Upload CV (PDF)"}</Button>
      {reusable && !reading && <Button variant="secondary" disabled={pending} onClick={() => { void readCv(null); }}>Use my uploaded CV</Button>}
      <p role="status" className="basis-full text-sm leading-6 text-muted">{note || "No CV handy? Continue and enter your details in the same steps."}</p>
    </div></div>}
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="degree_level" value={draft.degree_level} /><input type="hidden" name="university" value={draft.university} />
      <input type="hidden" name="field_of_study" value={draft.field_of_study} /><input type="hidden" name="graduation_year" value={draft.graduation_year} />
      <input type="hidden" name="location" value={draft.location} />
      <input type="hidden" name="skills" value={JSON.stringify(draft.skills)} />
      {current === "studies" && <><fieldset><legend className="metadata-text mb-2 font-medium">Degree</legend><div className="flex flex-wrap gap-3">{([["bachelor", "Bachelor's"], ["master", "Master's"]] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-sm ${draft.degree_level === value ? "border-accent bg-primary/15" : "border-border"}`}><input type="radio" value={value} checked={draft.degree_level === value} onChange={() => setDraft({ ...draft, degree_level: value })} className="accent-primary" />{label}</label>)}</div>{state.fields?.degree_level && <p role="alert" className="mt-2 text-sm">{state.fields.degree_level}</p>}</fieldset>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">{textFields.map(([key, label]) => <Input key={key} wrapperClassName={key === "university" || key === "field_of_study" ? "col-span-2 sm:col-span-1" : undefined} label={label} value={draft[key]} required={key !== "location"} maxLength={255} error={state.fields?.[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} {...(key === "graduation_year" ? { type: "number", min: 1900, max: 2100, inputMode: "numeric" as const } : key === "location" ? { autoComplete: "address-level2" } : { autoComplete: "off" })} />)}</div></>}
      {current === "skills" && <div className="min-w-0 space-y-1.5">
        <label htmlFor={skillId} className="metadata-text block font-medium">Skills</label>
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border border-border bg-background/60 px-2 py-1.5 focus-within:border-focus">
          {draft.skills.map(name => <button key={name} type="button" onClick={() => setDraft({ ...draft, skills: draft.skills.filter(item => item !== name) })} aria-label={`Remove ${name}`} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-elevated px-3 text-xs text-foreground hover:bg-primary/20">{name}<span aria-hidden="true">×</span></button>)}
          <input id={skillId} list={listId} value={skill} maxLength={100} placeholder={draft.skills.length ? "Add a skill" : "Type a skill and press Enter"} onChange={event => setSkill(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } else if (event.key === "Backspace" && !skill && draft.skills.length) setDraft({ ...draft, skills: draft.skills.slice(0, -1) }); }} className="min-h-8 min-w-28 flex-1 bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <datalist id={listId}>{suggestions.map(name => <option key={name} value={name} />)}</datalist>
        <Button variant="secondary" size="sm" onClick={addSkill} disabled={!skill.trim()}>Add skill</Button>
      </div>}
      {reviewSections.includes(current as ReviewSection) && <fieldset className="min-w-0">
        <legend className="sr-only">{titles[current]}</legend>
        {!entries.some(entry => entry.section === current) && <p className="rounded-control border border-dashed border-border bg-background/50 px-5 py-8 text-center text-sm text-muted">No {titles[current].toLowerCase()} added yet. Add one below or continue.</p>}
        <ul className={entries.some(entry => entry.section === current) ? "mt-1.5 divide-y divide-line rounded-control border border-border" : "hidden"}>
          {entries.filter(entry => entry.section === current).map(entry => {
            const errors = Object.entries(entryErrors).filter(([key]) => key === entry.key || key.startsWith(entry.key + "."));
            return <li key={entry.key} className="flex items-start gap-3 px-3 py-1.5">
              <input type="checkbox" checked={entry.include} onChange={event => updateEntry(entry.key, { include: event.target.checked })}
                aria-label={`Add ${entryLabel(entry)}`} className="mt-3 size-4 shrink-0 accent-primary" />
              <details className="min-w-0 flex-1" open={errors.length > 0 || entry.key.startsWith("manual-") || undefined}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                  <span className={`min-w-0 flex-1 truncate ${entry.include ? "text-foreground" : "text-muted line-through"}`}>{entryLabel(entry)}</span>
                  <span className="shrink-0 text-xs text-muted">{sectionLabels[entry.section]}</span>
                  <span className="shrink-0 text-xs text-accent underline">Edit</span>
                </summary>
                <div className="grid gap-3 pb-3 pt-1 sm:grid-cols-2">
                  {entryFields[entry.section].map(field => {
                    const value = entry.values[field.key], error = entryErrors[entry.key + "." + field.key];
                    const set = (next: string | boolean | string[]) => updateEntry(entry.key, current => ({ ...current, values: { ...current.values, [field.key]: next } }));
                    if (field.kind === "level") return <div key={field.key} className="text-sm"><label htmlFor={`${entry.key}-level`} className="metadata-text block">Level</label>
                      <select id={`${entry.key}-level`} value={entry.values.native === true ? "native" : typeof value === "string" ? value : ""}
                        onChange={event => updateEntry(entry.key, currentEntry => ({ ...currentEntry, values: { ...currentEntry.values, cefr: event.target.value === "native" ? "" : event.target.value, native: event.target.value === "native" } }))}
                        aria-invalid={!!error || !!entryErrors[entry.key + ".native"]} className="mt-1 min-h-11 w-full rounded-control border border-border bg-background px-3 text-base text-foreground sm:text-sm">
                        <option value="">Choose level</option>{cefrLevels.map(level => <option key={level} value={level}>{level}</option>)}<option value="native">Native</option>
                      </select>{error && <span role="alert" className="mt-1 block text-xs">{error}</span>}</div>;
                    if (field.kind === "check") return <label key={field.key} className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={value === true} onChange={event => set(event.target.checked)} className="size-4 accent-primary" />{field.label}</label>;
                    if (field.kind === "long") return <label key={field.key} className="block text-sm sm:col-span-2"><span className="metadata-text">{field.label}</span>
                      <textarea value={typeof value === "string" ? value : ""} rows={3} maxLength={5000} onChange={event => set(event.target.value)} className="mt-1 w-full rounded-control border border-border bg-background/60 px-3 py-2 text-base sm:text-sm" />
                      {error && <span role="alert" className="mt-1 block text-xs">{error}</span>}</label>;
                    return <Input key={field.key} label={field.label} placeholder={field.hint} error={error} maxLength={255}
                      value={Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""}
                      onChange={event => set(event.target.value)} />;
                  })}
                  {entryErrors[entry.key] && <p role="alert" className="text-xs sm:col-span-2">{entryErrors[entry.key]}</p>}
                </div>
              </details>
            </li>;
          })}
        </ul>
        <Button variant="secondary" className="mt-4" onClick={() => setEntries(list => [...list, newOnboardingEntry(current as ReviewSection, `manual-${crypto.randomUUID()}`)])}>Add {sectionLabels[current as ReviewSection].toLowerCase()}</Button>
      </fieldset>}
      {pageError && <p role="alert" className="text-sm">{pageError}</p>}
      {state.error && <p role="alert" className="text-sm">{state.error}</p>}
      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5">
        <Button variant="secondary" disabled={step === 0 || pending || reading} onClick={() => { setPageError(""); setStep(value => value - 1); }}>Back</Button>
        {step === steps.length - 1 ? <Button key="finish" type="submit" disabled={pending || reading}>{pending ? "Saving…" : "Finish and see jobs"}</Button> : <Button key="next" disabled={pending || reading} onClick={next}>{current === "cv" && !parsed ? "Continue without CV" : "Next"}</Button>}
      </div>
    </form>
  </section></div>;
}
