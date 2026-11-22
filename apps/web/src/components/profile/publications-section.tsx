"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyPublication, publicationDraft, validatePublication, normalizeDoi, PublicationConflict, type Publication, type PublicationDraft, type PublicationsService } from "@/lib/publications";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, fieldControl } from "@/components/ui/field";
import { safeResumeUrl } from "@/lib/resume-link";

export function PublicationsSection({ service }: { service?: PublicationsService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Publication>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<PublicationDraft>(emptyPublication);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Publication | null>(null);
  const [deleting, setDeleting] = useState<Publication | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof PublicationDraft, string>>>({});
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Publications could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Publications could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Publication | null) { setChecked(false); setEntry(value); setDraft(value ? publicationDraft(value) : emptyPublication()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setChecked(false); setEditing(false); setDraft(emptyPublication()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof PublicationDraft>(key: K, value: PublicationDraft[K]) { setChecked(false); setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    setChecked(false); const problems = validatePublication(draft); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setChecked(true); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyPublication()); setSuccess("Publication saved."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof PublicationConflict ? "This publication changed elsewhere. Your draft is retained; cancel and reload before retrying." : "The publication could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Publication deleted."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof PublicationConflict ? "This publication changed elsewhere. Cancel deletion and reload before retrying." : "The publication could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "title" | "publisher" | "publicationDate" | "doi" | "publicationUrl", label: string) => <Input label={label} name={key} value={draft[key]} required={key === "title"} disabled={pending} maxLength={key === "publicationDate" ? 7 : key === "doi" || key === "publicationUrl" ? 512 : 255} placeholder={key === "publicationDate" ? "YYYY or YYYY-MM" : undefined} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  const textarea = (key: "authors" | "description", label: string, hint?: string) => <Field id={id + "-" + key} label={label} hint={hint} error={errors[key]}><textarea id={id + "-" + key} name={key} rows={4} value={draft[key]} disabled={pending} maxLength={key === "authors" ? 25600 : 5000} aria-invalid={!!errors[key]} aria-describedby={[hint ? id + "-" + key + "-hint" : "", errors[key] ? id + "-" + key + "-error" : ""].filter(Boolean).join(" ") || undefined} className={fieldControl + " resize-y py-3"} onChange={event => change(key, event.target.value)} /></Field>;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="section-title">Publications</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add publication" : "Draft publication"}</Button>}</div>
    <div className="mt-4"><CollectionView state={state} emptyMessage="No publications yet." onRetry={() => { void reload(); }} renderEntry={row => {
      const doi = normalizeDoi(row.doi), url = safeResumeUrl(row.publicationUrl);
      return <article className="space-y-3 break-words"><h3 className="card-title">{row.title}</h3>
        {row.authors.length > 0 && <ol aria-label="Authors in publication order" className="list-inside list-decimal space-y-1 text-sm">{row.authors.map((author, index) => <li key={index}>{author}</li>)}</ol>}
        {row.publisher && <p className="text-sm">{row.publisher}</p>}
        {row.publicationDate && <p className="text-xs text-muted">Published: {row.publicationDate}</p>}
        {row.description && <p className="whitespace-pre-wrap text-sm leading-6">{row.description}</p>}
        {doi.url ? <a href={doi.url} target="_blank" rel="noopener noreferrer" className="inline-block max-w-full rounded-control py-2 text-sm text-accent underline">DOI: {doi.doi}<span className="sr-only"> (opens in a new tab)</span></a> : row.doi ? <p className="text-xs text-muted">An invalid saved DOI is hidden. Edit this publication to correct it.</p> : null}
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit max-w-full rounded-control py-2 text-sm text-accent underline">View publication<span className="sr-only"> (opens in a new tab)</span></a> : row.publicationUrl ? <p className="text-xs text-muted">An invalid saved link is hidden. Edit this publication to correct it.</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.title}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.title}</span></Button></div></article>;
    }} /></div>
    {editing && <form ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable. Drafts are lost when you leave or reload.</p>}
      {input("title", "Publication title (required)")}
      {textarea("authors", "Authors (optional)", "One author per line, in publication order. Leave blank if unknown.")}
      {input("publisher", "Publisher / journal / conference (optional)")}{input("publicationDate", "Publication date (optional)")}
      <p className="text-xs leading-6 text-muted">Use YYYY or YYYY-MM. Leave unknown dates blank; no day is assumed.</p>
      {input("doi", "DOI (optional)")}
      <p className="text-xs leading-6 text-muted">Enter a DOI identifier or an HTTPS doi.org link. DOI and publication details are not verified.</p>
      {input("publicationUrl", "Publication URL (optional)")}{textarea("description", "Description / abstract (optional)")}
      <div className="flex flex-wrap gap-3">{!service && <Button type="submit" variant="secondary">Validate draft</Button>}<Button type={service ? "submit" : "button"} disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
      {checked && <p role="status" className="text-sm text-muted">Draft is valid. It has not been saved; saving is unavailable.</p>}
    </form>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm publication deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.title}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {service && !editing && !deleting && <Button variant="ghost" disabled={pending} onClick={() => { void reload(); }}>Reload publications</Button>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
