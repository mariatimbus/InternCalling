"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyCertificate, certificateDraft, validateCertificate, CertificateConflict, type Certificate, type CertificateDraft, type CertificatesService } from "@/lib/certificates";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeResumeUrl } from "@/lib/resume-link";

export function CertificatesSection({ service }: { service?: CertificatesService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Certificate>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<CertificateDraft>(emptyCertificate);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Certificate | null>(null);
  const [deleting, setDeleting] = useState<Certificate | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CertificateDraft, string>>>({});
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Certificates could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Certificates could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Certificate | null) { setEntry(value); setDraft(value ? certificateDraft(value) : emptyCertificate()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setEditing(false); setDraft(emptyCertificate()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof CertificateDraft>(key: K, value: CertificateDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const problems = validateCertificate(draft); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setError("Saving is unavailable. This draft has not been saved."); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyCertificate()); setSuccess("Certificate saved."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof CertificateConflict ? "This certificate changed elsewhere. Your draft is retained; cancel and reload before retrying." : "The certificate could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Certificate deleted."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof CertificateConflict ? "This certificate changed elsewhere. Cancel deletion and reload before retrying." : "The certificate could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "name" | "organization" | "issueDate" | "expirationDate" | "credentialId" | "credentialUrl", label: string) => <Input label={label} name={key} value={draft[key]} required={key === "name" || key === "organization"} disabled={pending || key === "expirationDate" && draft.doesNotExpire} maxLength={key.includes("Date") ? 7 : key.endsWith("Url") ? 512 : 255} placeholder={key.includes("Date") ? "YYYY or YYYY-MM" : undefined} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="section-title">Certificates</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add certificate" : "Draft certificate"}</Button>}</div>
    <div className="mt-4"><CollectionView state={state} emptyMessage="No certificates yet." onRetry={() => { void reload(); }} renderEntry={row => <article className="space-y-3 break-words"><h3 className="card-title">{row.name}</h3><p className="text-sm">{row.organization}</p>
      {row.issueDate && <p className="text-xs text-muted">Issued: {row.issueDate}</p>}
      {row.doesNotExpire ? <p className="text-xs text-muted">Does not expire</p> : row.expirationDate ? <p className="text-xs text-muted">Expires: {row.expirationDate}</p> : null}
      {row.credentialId && <p className="text-sm">Credential ID: {row.credentialId}</p>}
      {safeResumeUrl(row.credentialUrl) ? <a href={safeResumeUrl(row.credentialUrl)!} target="_blank" rel="noopener noreferrer" className="inline-block rounded-control py-2 text-sm text-accent underline">View credential<span className="sr-only"> (opens in a new tab)</span></a> : row.credentialUrl ? <p className="text-xs text-muted">An invalid saved link is hidden. Edit this certificate to correct it.</p> : null}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.name}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.name}</span></Button></div></article>} /></div>
    {editing && <div onKeyDown={event => { if (event.key === "Escape") cancel(); }}><form id={id + "-form"} ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable.</p>}
      {input("name", "Certificate name (required)")}{input("organization", "Issuing organization (required)")}
      <p className="text-xs leading-6 text-muted">Dates accept YYYY or YYYY-MM. No day is assumed. Leave unknown dates blank.</p>
      <div className="grid gap-4 sm:grid-cols-2">{input("issueDate", "Issue date (optional)")}{input("expirationDate", draft.doesNotExpire ? "Expiration date (not applicable)" : "Expiration date (optional)")}</div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="doesNotExpire" checked={draft.doesNotExpire} disabled={pending} onChange={event => { const checked = event.target.checked; setDraft(current => ({ ...current, doesNotExpire: checked, expirationDate: checked ? "" : current.expirationDate })); setErrors(current => ({ ...current, expirationDate: undefined })); }} />This credential does not expire</label>
      {input("credentialId", "Credential ID (optional)")}{input("credentialUrl", "Credential URL (optional)")}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
      </form>
    </div>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm certificate deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.name}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {service && !editing && !deleting && <Button variant="ghost" disabled={pending} onClick={() => { void reload(); }}>Reload certificates</Button>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
