"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyHonour, honourDraft, validateHonour, HonourConflict, type Honour, type HonourDraft, type HonoursService } from "@/lib/honours";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, fieldControl } from "@/components/ui/field";
import { safeResumeUrl } from "@/lib/resume-link";

export function HonoursSection({ service }: { service?: HonoursService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Honour>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<HonourDraft>(emptyHonour);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Honour | null>(null);
  const [deleting, setDeleting] = useState<Honour | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof HonourDraft, string>>>({});
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Honours & Awards could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Honours & Awards could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Honour | null) { setChecked(false); setEntry(value); setDraft(value ? honourDraft(value) : emptyHonour()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setChecked(false); setEditing(false); setDraft(emptyHonour()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof HonourDraft>(key: K, value: HonourDraft[K]) { setChecked(false); setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    setChecked(false); const problems = validateHonour(draft); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setChecked(true); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyHonour()); setSuccess("Award saved."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof HonourConflict ? "This award changed elsewhere. Your draft is retained; cancel and reload before retrying." : "The award could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Award deleted."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof HonourConflict ? "This award changed elsewhere. Cancel deletion and reload before retrying." : "The award could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "title" | "organization" | "receivedDate" | "referenceUrl", label: string) => <Input label={label} name={key} value={draft[key]} required={key === "title"} disabled={pending} maxLength={key === "receivedDate" ? 7 : key === "referenceUrl" ? 512 : 255} placeholder={key === "receivedDate" ? "YYYY or YYYY-MM" : undefined} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="section-title">Honours &amp; Awards</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add award" : "Draft award"}</Button>}</div>
    <div className="mt-4"><CollectionView state={state} emptyMessage="No honours or awards yet." onRetry={() => { void reload(); }} renderEntry={row => <article className="space-y-3 break-words"><h3 className="card-title">{row.title}</h3>
      {row.organization && <p className="text-sm">{row.organization}</p>}
      {row.receivedDate && <p className="text-xs text-muted">Received: {row.receivedDate}</p>}
      {row.description && <p className="whitespace-pre-wrap text-sm leading-6">{row.description}</p>}
      {safeResumeUrl(row.referenceUrl) ? <a href={safeResumeUrl(row.referenceUrl)!} target="_blank" rel="noopener noreferrer" className="inline-block rounded-control py-2 text-sm text-accent underline">View reference<span className="sr-only"> (opens in a new tab)</span></a> : row.referenceUrl ? <p className="text-xs text-muted">An invalid saved link is hidden. Edit this award to correct it.</p> : null}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.title}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.title}</span></Button></div></article>} /></div>
    {editing && <form ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable. Drafts are lost when you leave or reload.</p>}
      {input("title", "Award / distinction title (required)")}{input("organization", "Issuing organization (optional)")}
      {input("receivedDate", "Date received (optional)")}
      <p className="text-xs leading-6 text-muted">Use YYYY or YYYY-MM. Leave unknown dates blank; no day is assumed.</p>
      <Field id={id + "-description"} label="Description (optional)" error={errors.description}><textarea id={id + "-description"} name="description" rows={4} value={draft.description} disabled={pending} maxLength={5000} aria-invalid={!!errors.description} aria-describedby={errors.description ? id + "-description-error" : undefined} className={fieldControl + " resize-y py-3"} onChange={event => change("description", event.target.value)} /></Field>
      {input("referenceUrl", "Reference URL (optional)")}
      <div className="flex flex-wrap gap-3">{!service && <Button type="submit" variant="secondary">Validate draft</Button>}<Button type={service ? "submit" : "button"} disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
      {checked && <p role="status" className="text-sm text-muted">Draft is valid. It has not been saved; saving is unavailable.</p>}
    </form>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm award deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.title}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {service && !editing && !deleting && <Button variant="ghost" disabled={pending} onClick={() => { void reload(); }}>Reload honours</Button>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
