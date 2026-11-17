"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { finishOnboarding } from "@/app/auth/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { validateOnboarding, type OnboardingDraft } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const steps = [
  { key: "degree_level", title: "What are you studying towards?", help: "We will check opportunities against your degree level.", label: "Degree level" },
  { key: "university", title: "Where do you study?", help: "Enter the name of your university or institution.", label: "University" },
  { key: "field_of_study", title: "What is your field of study?", help: "Use the subject you study, such as Computer Science.", label: "Field of study" },
  { key: "graduation_year", title: "When will you graduate?", help: "Enter your expected or actual graduation year.", label: "Graduation year" },
  { key: "location", title: "Where are you based?", help: "A city and country help us understand your location.", label: "Location" },
  { key: "skills", title: "What skills would you like to put to work?", help: "Search or add your own. You can skip this and add skills later.", label: "Skills" },
] as const;

export type OnboardingFlowProps = { initial: OnboardingDraft; suggestions: string[]; submitAction?: (previous:ActionState, form:FormData)=>Promise<ActionState>; onPendingChange?:(pending:boolean)=>void; demo?:boolean };
export function OnboardingFlow({ initial, suggestions, submitAction = finishOnboarding, onPendingChange, demo=false }: OnboardingFlowProps) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(submitAction, {} as ActionState);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [step]);
  useEffect(() => { onPendingChange?.(pending); }, [pending,onPendingChange]);
  const current = steps[step];
  const summary = step === steps.length;
  function go(next: number) { setError(""); setStep(next); }
  function advance() {
    const problem = validateOnboarding(draft)[current.key];
    if (problem) { setError(problem); return; }
    go(step + 1);
  }
  function addSkill(name: string) {
    const skill = name.trim().toLowerCase();
    if (!skill || skill.length > 100 || draft.skills.length >= 100) { setError("Use up to 100 skills, with 100 characters or fewer per skill."); return; }
    setDraft({ ...draft, skills: [...new Set([...draft.skills, skill])] }); setQuery(""); setError("");
  }
  const choices = suggestions.filter((skill) => skill.toLowerCase().includes(query.trim().toLowerCase()) && !draft.skills.includes(skill.toLowerCase())).slice(0, 10);
  return <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 sm:pt-12">
    <div className="mb-10"><div className="mb-3 flex justify-between text-xs text-muted"><span>Your internship profile</span><span>Step {step + 1} of 7</span></div><progress aria-label="Onboarding progress" value={step + 1} max={7} className="h-1.5 w-full overflow-hidden rounded-full accent-primary" /></div>
    <section className="rounded-panel bg-card p-6 sm:p-10">
      <h1 ref={title} tabIndex={-1} className="text-3xl leading-tight tracking-tight outline-none sm:text-4xl">{summary ? (demo?"Confirm your sample answers":"Ready to find your matches?") : current.title}</h1>
      <p className="mt-4 max-w-lg text-sm leading-7 text-muted">{summary ? (demo?"Review these demonstration answers. Confirmation updates demo memory only, never your real account.":"Review your details. We will save this profile and use it to match you with internships.") : current.help}</p>
      {summary ? <form action={action} onSubmit={()=>onPendingChange?.(true)} className="mt-7 space-y-6">
        {steps.map(({ key, label }, index) => <div key={key} className="flex items-start justify-between gap-4 border-b border-line pb-4"><input type="hidden" name={key} value={key === "skills" ? JSON.stringify(draft.skills) : draft[key]} /><div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words text-sm">{key === "skills" ? draft.skills.join(", ") || "No skills added" : key === "degree_level" ? (draft[key] === "bachelor" ? "Bachelor's" : "Master's") : draft[key]}</p>{state.fields?.[key] && <p className="mt-2 text-sm" role="alert">{state.fields[key]}</p>}</div><Button variant="ghost" size="sm" disabled={pending} onClick={() => go(index)} aria-label={`Edit ${label.toLowerCase()}`}>Edit</Button></div>)}
        {state.error && <p role="alert" className="text-sm leading-6">{state.error}</p>}
        <div className="flex flex-wrap justify-between gap-3"><Button variant="ghost" disabled={pending} onClick={() => go(step - 1)}>Back</Button><Button type="submit" disabled={pending}>{pending ? (demo?"Confirming sample answers...":"Saving your profile…") : demo?"Confirm sample answers":"Find my matches"}</Button></div>
      </form> : <form className="mt-8 space-y-6" noValidate onSubmit={(event) => { event.preventDefault(); if (current.key === "skills" && query.trim()) addSkill(query); else advance(); }}>
        {current.key === "degree_level" ? <fieldset><legend className="sr-only">Degree level</legend><div className="grid gap-3 sm:grid-cols-2">{([['bachelor', "Bachelor's"], ['master', "Master's"]] as const).map(([value, label]) => <label key={value} className={`flex min-h-20 cursor-pointer items-center gap-3 rounded-card border px-5 ${draft.degree_level === value ? "border-accent bg-primary/15" : "border-border bg-surface"}`}><input type="radio" name="degree_level" value={value} checked={draft.degree_level === value} onChange={() => { setDraft({ ...draft, degree_level: value }); setError(""); }} className="size-4 accent-primary" required aria-describedby={error ? "step-error" : undefined} /><span>{label}</span></label>)}</div></fieldset>
        : current.key === "skills" ? <div className="space-y-5">
          <div className="flex items-end gap-2"><Input label="Search or add a skill" type="search" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} wrapperClassName="min-w-0 flex-1" /><Button variant="secondary" onClick={() => addSkill(query)} disabled={!query.trim()}>Add</Button></div>
          {draft.skills.length > 0 && <ul aria-label="Selected skills" className="flex flex-wrap gap-2">{draft.skills.map((skill) => <li key={skill}><Button variant="secondary" size="sm" onClick={() => setDraft({ ...draft, skills: draft.skills.filter((item) => item !== skill) })} aria-label={`Remove ${skill}`}>{skill}<span aria-hidden="true">×</span></Button></li>)}</ul>}
          {choices.length > 0 && <div><p className="mb-3 text-xs text-muted">Suggested skills</p><div className="flex flex-wrap gap-2">{choices.map((skill) => <Button key={skill} variant="secondary" size="sm" onClick={() => addSkill(skill)}>{skill}</Button>)}</div></div>}
        </div> : <Input key={current.key} label={current.label} name={current.key} type={current.key === "graduation_year" ? "number" : "text"} min={current.key === "graduation_year" ? 1900 : undefined} max={current.key === "graduation_year" ? 2100 : undefined} step={current.key === "graduation_year" ? 1 : undefined} maxLength={255} required value={draft[current.key]} onChange={(event) => { setDraft({ ...draft, [current.key]: event.target.value }); setError(""); }} error={error || undefined} autoComplete={current.key === "location" ? "address-level2" : "off"} />}
        {error && (current.key === "skills" || current.key === "degree_level") && <p id="step-error" role="alert" className="text-sm">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3"><Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</Button><div className="flex gap-2">{current.key === "skills" && <Button variant="ghost" onClick={() => go(step + 1)}>Skip</Button>}<Button type="submit">Continue</Button></div></div>
      </form>}
    </section>
    <p className="mt-6 text-center text-xs leading-6 text-muted">{demo?"Sample answers stay in demo memory. Your real account is unchanged.":"Your answers are saved when you select Find my matches."}</p>
  </div>;
}
