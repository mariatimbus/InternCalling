"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyExperience, experienceDraft, validateExperience, type Experience, type ExperienceDraft, type ExperienceService } from "@/lib/experience";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, fieldControl } from "@/components/ui/field";

export function ExperienceSection({ service }: { service?: ExperienceService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Experience>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<ExperienceDraft>(emptyExperience);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Experience | null>(null);
  const [deleting, setDeleting] = useState<Experience | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ExperienceDraft, string>>>({});
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Experience could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="role"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Experience could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Experience | null) { setEntry(value); setDraft(value ? experienceDraft(value) : emptyExperience()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setEditing(false); setDraft(emptyExperience()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof ExperienceDraft>(key: K, value: ExperienceDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const problems = validateExperience(draft); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setError("Saving is unavailable. This draft has not been saved."); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyExperience()); setSuccess("Experience saved."); heading.current?.focus();
    } catch { setError("Experience could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Experience deleted."); heading.current?.focus();
    } catch { setError("Experience could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "role" | "organization" | "location" | "startDate" | "endDate", label: string) => <Input label={label} name={key} value={draft[key]} required={key !== "location" && !(key === "endDate" && draft.current)} disabled={pending || key === "endDate" && draft.current} maxLength={key.includes("Date") ? 7 : 255} placeholder={key.includes("Date") ? "YYYY or YYYY-MM" : undefined} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="section-title">Experience</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add experience" : "Draft experience"}</Button>}</div>
    <div className="mt-4"><CollectionView state={state} onRetry={() => { void reload(); }} renderEntry={row => <article className="space-y-2 break-words"><h3 className="card-title">{row.role}</h3><p className="text-sm">{row.organization}{row.location ? " / " + row.location : ""}</p><p className="text-xs text-muted">{row.startDate} to {row.current ? "Present" : row.endDate}</p><p className="whitespace-pre-wrap text-sm leading-6">{row.description}</p>{row.achievements.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{row.achievements.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.role}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.role}</span></Button></div></article>} /></div>
    {editing && <form ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable.</p>}
      {input("role", "Job title / role (required)")}{input("organization", "Organization (required)")}{input("location", "Location (optional)")}
      <p className="text-xs leading-6 text-muted">Dates accept YYYY or YYYY-MM. No day is assumed. Required fields are labelled.</p>
      <div className="grid gap-4 sm:grid-cols-2">{input("startDate", "Start date (required)")}{input("endDate", draft.current ? "End date (not applicable)" : "End date (required unless current)")}</div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="current" checked={draft.current} disabled={pending} onChange={event => { const checked = event.target.checked; setDraft(current => ({ ...current, current: checked, endDate: checked ? "" : current.endDate })); setErrors(current => ({ ...current, endDate: undefined })); }} />I currently work here</label>
      {(["description", "achievements"] as const).map(key => <Field key={key} id={id + "-" + key} label={key === "description" ? "Description / responsibilities (optional)" : "Achievement bullets (optional, one per line)"} error={errors[key]}><textarea id={id + "-" + key} name={key} rows={4} value={draft[key]} disabled={pending} maxLength={key === "description" ? 5000 : undefined} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? id + "-" + key + "-error" : undefined} className={fieldControl + " resize-y py-3"} onChange={event => change(key, event.target.value)} /></Field>)}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
    </form>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm experience deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.role} at {deleting.organization}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
