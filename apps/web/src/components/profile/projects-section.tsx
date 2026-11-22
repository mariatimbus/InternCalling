"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { emptyProject, projectDraft, validateProject, ProjectConflict, type Project, type ProjectDraft, type ProjectsService } from "@/lib/projects";
import { CollectionView, type CollectionState } from "./collection-view";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SkillChip } from "./skill-chip";
import { GroupedSkillPicker } from "./grouped-skill-picker";
import { safeResumeUrl } from "@/lib/resume-link";
import { Field, fieldControl } from "@/components/ui/field";

export function ProjectsSection({ service }: { service?: ProjectsService }) {
  const id = useId();
  const [state, setState] = useState<CollectionState<Project>>(service ? { kind: "loading" } : { kind: "unconnected" });
  const [draft, setDraft] = useState<ProjectDraft>(emptyProject);
  const [editing, setEditing] = useState(false), [entry, setEntry] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectDraft, string>>>({});
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [pending, setPending] = useState(false);
  const busy = useRef(false), form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!service) return;
    let active = true;
    service.load().then(entries => { if (active) setState({ kind: "ready", entries }); }).catch(() => { if (active) setState({ kind: "error", message: "Projects could not be loaded. Check your connection and retry." }); });
    return () => { active = false; };
  }, [service]);
  useEffect(() => { if (editing) form.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); }, [editing]);
  useEffect(() => { if (deleting) confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [deleting]);
  async function reload() {
    if (!service || busy.current) return;
    busy.current = true; setState({ kind: "loading" });
    try { setState({ kind: "ready", entries: await service.load() }); }
    catch { setState({ kind: "error", message: "Projects could not be loaded. Check your connection and retry." }); }
    finally { busy.current = false; }
  }
  function begin(value: Project | null) { setEntry(value); setDraft(value ? projectDraft(value) : emptyProject()); setErrors({}); setError(""); setSuccess(""); setEditing(true); setDeleting(null); }
  function cancel() { if (busy.current) return; setEditing(false); setDraft(emptyProject()); setErrors({}); setError(""); setEntry(null); heading.current?.focus(); }
  function change<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const problems = validateProject(draft); setErrors(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { form.current?.querySelector<HTMLElement>('[name="' + Object.keys(problems)[0] + '"]')?.focus(); return; }
    if (!service) { setError("Saving is unavailable. This draft has not been saved."); return; }
    busy.current = true; setPending(true);
    try {
      const saved = entry ? await service.update(entry.id, entry.revision, draft) : await service.create(draft);
      setState(current => ({ kind: "ready", entries: [...(current.kind === "ready" ? current.entries.filter(row => row.id !== saved.id) : []), saved].sort((a, b) => a.position - b.position) }));
      setEditing(false); setEntry(null); setDraft(emptyProject()); setSuccess("Project saved."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof ProjectConflict ? "This project changed elsewhere. Your draft is retained; cancel and reload before retrying." : "Projects could not be saved. Your draft is still here. Retry, or reload after checking for conflicting changes."); }
    finally { busy.current = false; setPending(false); }
  }
  async function remove() {
    if (!service || !deleting || busy.current) return;
    busy.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await service.remove(deleting.id, deleting.revision);
      setState(current => current.kind === "ready" ? { ...current, entries: current.entries.filter(row => row.id !== deleting.id) } : current);
      setDeleting(null); setSuccess("Project deleted."); heading.current?.focus();
    } catch (cause) { setError(cause instanceof ProjectConflict ? "This project changed elsewhere. Cancel deletion and reload before retrying." : "Projects could not be deleted. The entry is still shown. Retry or cancel."); }
    finally { busy.current = false; setPending(false); }
  }
  const input = (key: "name" | "role" | "startDate" | "endDate" | "repositoryUrl" | "demoUrl", label: string) => <Input label={label} name={key} value={draft[key]} required={key === "name"} disabled={pending || key === "endDate" && draft.ongoing} maxLength={key.includes("Date") ? 7 : key.endsWith("Url") ? 512 : 255} placeholder={key.includes("Date") ? "YYYY or YYYY-MM" : undefined} error={errors[key]} onChange={event => change(key, event.target.value)} />;
  return <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby={id + "-title"} aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id={id + "-title"} className="text-lg outline-none">Projects</h2>{!editing && <Button disabled={pending || !!deleting || !!service && state.kind !== "ready"} onClick={() => begin(null)}>{service ? "Add project" : "Draft project"}</Button>}</div>
    <div className="mt-4"><CollectionView state={state} emptyMessage="No projects yet." onRetry={() => { void reload(); }} renderEntry={row => <article className="space-y-3 break-words"><h3 className="font-medium">{row.name}</h3>{row.role && <p className="text-sm">{row.role}</p>}<p className="text-xs text-muted">{row.startDate || "Start date not provided"} to {row.ongoing ? "Present" : row.endDate || "End date not provided"}</p><p className="whitespace-pre-wrap text-sm leading-6">{row.description}</p><div className="flex flex-wrap gap-2">{row.technologies.map(name => <span key={name} className="rounded-full bg-surface px-3 py-2 text-xs">{name}</span>)}</div><div className="flex flex-wrap gap-4">{(["repositoryUrl", "demoUrl"] as const).map(key => {
      const url = safeResumeUrl(row[key]);
      return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="rounded-control py-2 text-sm text-accent underline">{key === "repositoryUrl" ? "Repository" : "Live demo"}<span className="sr-only"> (opens in a new tab)</span></a> : row[key] ? <p key={key} className="text-xs text-muted">An invalid saved link is hidden. Edit this project to correct it.</p> : null;
    })}</div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || editing || !!deleting} onClick={() => begin(row)}>Edit<span className="sr-only"> {row.name}</span></Button><Button variant="ghost" disabled={pending || editing || !!deleting} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }}>Delete<span className="sr-only"> {row.name}</span></Button></div></article>} /></div>
    {editing && <div onKeyDown={event => { if (event.key === "Escape") cancel(); }}><form id={id + "-form"} ref={form} noValidate onSubmit={save} className="mt-6 space-y-4" onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      {!service && <p role="status" className="text-sm text-muted">Draft only - saving is unavailable.</p>}
      {input("name", "Project name (required)")}{input("role", "Role (optional)")}
      <p className="text-xs leading-6 text-muted">Dates accept YYYY or YYYY-MM. No day is assumed. Required fields are labelled.</p>
      <div className="grid gap-4 sm:grid-cols-2">{input("startDate", "Start date (optional)")}{input("endDate", draft.ongoing ? "End date (not applicable)" : "End date (optional)")}</div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="ongoing" checked={draft.ongoing} disabled={pending} onChange={event => { const checked = event.target.checked; setDraft(current => ({ ...current, ongoing: checked, endDate: checked ? "" : current.endDate })); setErrors(current => ({ ...current, endDate: undefined })); }} />Ongoing</label>
      <Field id={id + "-description"} label="Description (optional)" error={errors.description}><textarea id={id + "-description"} name="description" rows={4} value={draft.description} disabled={pending} maxLength={5000} aria-invalid={!!errors.description} aria-describedby={errors.description ? id + "-description-error" : undefined} className={fieldControl + " resize-y py-3"} onChange={event => change("description", event.target.value)} /></Field>
      {input("repositoryUrl", "Repository URL (optional)")}{input("demoUrl", "Live-demo URL (optional)")}
      </form>
      <fieldset className="my-5 min-w-0" disabled={pending}><legend className="text-sm">Technologies / skills</legend><ul aria-label="Project technologies" className="mt-3 flex flex-wrap gap-2">{draft.technologies.map(name => <li key={name}><SkillChip skill={{ name }} disabled={pending} onRemove={() => change("technologies", draft.technologies.filter(value => value !== name))} /></li>)}</ul>
      {errors.technologies && <p role="alert" className="text-sm">{errors.technologies}</p>}
      <GroupedSkillPicker catalog={[]} selected={draft.technologies.map(name => ({ name }))} loading={false} error="" disabled={pending} onAdd={async name => { const normalized = name.trim().toLowerCase(); if (draft.technologies.length >= 100) { setErrors(current => ({ ...current, technologies: "Use up to 100 technologies." })); return false; } setDraft(current => ({ ...current, technologies: [...new Set([...current.technologies, normalized])] })); return true; }} />
      </fieldset>
      <div className="flex flex-wrap gap-3"><Button type="submit" form={id + "-form"} disabled={pending || !service}>{pending ? "Saving..." : service ? "Save" : "Saving unavailable"}</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel</Button></div>
    </div>}
    {deleting && <div ref={confirmation} className="mt-5 rounded-card border border-border p-4" role="group" aria-label="Confirm project deletion" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { setDeleting(null); setError(""); heading.current?.focus(); } }}><p className="text-sm">Delete {deleting.name}?</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { setDeleting(null); setError(""); heading.current?.focus(); }}>Keep entry</Button><Button disabled={pending} onClick={() => { void remove(); }}>{pending ? "Deleting..." : "Confirm delete"}</Button></div></div>}
    {error && <p role="alert" className="mt-4 text-sm leading-6">{error}</p>}
    {service && !editing && !deleting && <Button variant="ghost" disabled={pending} onClick={() => { void reload(); }}>Reload projects</Button>}
    {success && <p role="status" className="mt-4 text-sm">{success}</p>}
  </section>;
}
