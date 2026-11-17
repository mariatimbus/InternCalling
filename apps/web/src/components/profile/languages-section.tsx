"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyLanguage, languageDraft, validateLanguage, cefrLevels, setLanguageNative, LanguageConflict, LanguageDuplicate, type Language, type LanguageDraft, type LanguagesService } from "@/lib/languages";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { safeResumeUrl } from "@/lib/resume-link";

export function LanguagesSection({ service }: { service?: LanguagesService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Language>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<LanguageDraft>(emptyLanguage);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Language | null>(null);
  const [deleting, setDeleting] = useState<Language | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LanguageDraft, string>>>({});
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Languages could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Languages could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Language | null) { setChecked(false); setEntry(value); setDraft(value ? languageDraft(value) : emptyLanguage()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setChecked(false); setEditing(false); setDraft(emptyLanguage()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof LanguageDraft>(key: K, value: LanguageDraft[K]) { setChecked(false); setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    setChecked(false); const problems = validateLanguage(draft, state.kind === "ready" ? state.entries : [], entry?.id); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setChecked(true); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyLanguage()); setSuccess("Language saved."); heading.current?.focus();
    } catch (cause) { if (cause instanceof LanguageDuplicate) { setErrors({ name: "This language is already listed. Reload languages to review existing entries." }); form.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); } setError(cause instanceof LanguageDuplicate ? "This language is already listed. Your draft is retained; cancel and reload to review it." : cause instanceof LanguageConflict ? "This language changed elsewhere. Your draft is retained; cancel and reload before retrying." : "The language could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Language deleted."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof LanguageConflict ? "This language changed elsewhere. Cancel deletion and reload before retrying." : "The language could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "name" | "referenceName" | "referenceUrl", label: string) => <Input label={label} name={key} value={draft[key]} required={key === "name"} disabled={pending} maxLength={key === "referenceUrl" ? 512 : 255} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="text-lg outline-none">Languages</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add language" : "Draft language"}</Button>}</div>
    <p className="mt-3 text-xs leading-6 text-muted">Proficiency is self-reported. References do not verify or certify it.</p>
    <div className="mt-4"><CollectionView state={state} emptyMessage="No languages yet." onRetry={() => { void reload(); }} renderEntry={row => <article className="space-y-3 break-words"><h3 className="font-medium">{row.name}</h3>
      <p className="text-sm">{row.native ? "Native language" : row.cefr ? "CEFR " + row.cefr : "Proficiency not specified"}</p>
      {row.referenceName && <p className="text-sm">Reference: {row.referenceName}</p>}
      {safeResumeUrl(row.referenceUrl) ? <a href={safeResumeUrl(row.referenceUrl)!} target="_blank" rel="noopener noreferrer" className="inline-block rounded-control py-2 text-sm text-accent underline">View reference<span className="sr-only"> (opens in a new tab)</span></a> : row.referenceUrl ? <p className="text-xs text-muted">An invalid saved link is hidden. Edit this language to correct it.</p> : null}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.name}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.name}</span></Button></div></article>} /></div>
    {editing && <form ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable. Drafts are lost when you leave or reload.</p>}
      {input("name", "Language name (required)")}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={draft.native ? "CEFR level (not applicable)" : "CEFR level (optional)"} name="cefr" value={draft.cefr} disabled={pending || draft.native} error={errors.cefr} onChange={event => change("cefr", event.target.value as LanguageDraft["cefr"])}><option value="">Not specified</option>{cefrLevels.map(level => <option key={level} value={level}>{level}</option>)}</Select>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="native" checked={draft.native} disabled={pending} onChange={event => { const native = event.target.checked; setChecked(false); setDraft(current => setLanguageNative(current, native)); setErrors(current => ({ ...current, native: undefined, cefr: undefined })); }} />Native language</label>
      </div>
      {input("referenceName", "Certificate / reference name (optional)")}{input("referenceUrl", "Reference URL (optional)")}
      <div className="flex flex-wrap gap-3">{!service && <Button type="submit" variant="secondary">Validate draft</Button>}<Button type={service ? "submit" : "button"} disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
      {checked && <p role="status" className="text-sm text-muted">Draft fields are valid. It has not been saved; saving is unavailable.</p>}
    </form>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm language deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.name}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {service && !editing && !deleting && <Button variant="ghost" disabled={pending} onClick={() => { void reload(); }}>Reload languages</Button>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
