"use client";

import { useEffect, useRef, useState } from "react";
import type { Skill } from "@/lib/api/types";
import { normalizeSkillName, skillCatalogResult, uniqueSkills } from "@/lib/profile-skills";
import { addProfileSkill, getProfileSkills, getSkillSuggestions, removeProfileSkill } from "@/app/(workspace)/profile/skills-actions";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ErrorState } from "@/components/ui/error-state";
import { SkillChip } from "./skill-chip";
import { GroupedSkillPicker as SkillAutocomplete } from "./grouped-skill-picker";

export function ProfileSkills({ initialSkills, persistedSkills, onConfirmed, onUnavailable }: { initialSkills: Skill[] | null; persistedSkills?: Skill[] | null; onConfirmed?: (skills: Skill[]) => void; onUnavailable?: () => void }) {
  const [localSkills, setSkills] = useState<Skill[] | null>(() => initialSkills ? uniqueSkills(initialSkills) : null);
  const skills = persistedSkills === undefined ? localSkills : persistedSkills;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialSkills ? "" : "Your skills could not be loaded. Check your connection and refresh skills.");
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState<{ name: string; operation: "add" | "remove" } | null>(null);
  const inFlight = useRef(false);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    getSkillSuggestions().then((result) => {
      if (!active) return;
      const catalogResult = skillCatalogResult(result);
      setCatalog(catalogResult.skills); setCatalogError(catalogResult.error); setCatalogLoading(false);
    }).catch(() => { if (active) { setCatalogError("Skill suggestions could not be loaded. Retry suggestions, or enter a custom name."); setCatalogLoading(false); } });
    return () => { active = false; };
  }, []);

  async function refreshCatalog() {
    setCatalogLoading(true); setCatalogError("");
    try { const result = skillCatalogResult(await getSkillSuggestions()); setCatalog(result.skills); setCatalogError(result.error); }
    catch { setCatalogError("Skill suggestions could not be loaded. Retry suggestions, or enter a custom name."); }
    finally { setCatalogLoading(false); }
  }
  async function refreshSkills() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(""); setStatus("Loading your skills...");
    try {
      const result = await getProfileSkills();
      if (result.skills) { onConfirmed?.(result.skills); setSkills(result.skills); setRetry(null); setStatus("Skills refreshed."); }
      else { onUnavailable?.(); setError(skills === null ? "Skills could not be loaded. Check your connection and retry." : result.error ?? "Skills could not be refreshed. Try again."); setStatus(""); }
    } catch { onUnavailable?.(); setError("Skills could not be refreshed. Check your connection and retry."); setStatus(""); }
    finally { inFlight.current = false; setPending(false); }
  }
  async function mutate(name: string, operation: "add" | "remove") {
    if (inFlight.current || skills === null) return false;
    inFlight.current = true; setPending(true); setError(""); setStatus("Saving skill changes..."); setRetry(null);
    try {
      const result = await (operation === "add" ? addProfileSkill(name) : removeProfileSkill(name));
      const confirmed = result.skills;
      if (!confirmed) { onUnavailable?.(); setError(result.error ?? "The skill change could not be confirmed. Retry or refresh skills."); setRetry({ name, operation }); setStatus(""); return false; }
      onConfirmed?.(confirmed); setSkills(confirmed); setStatus(result.success ?? "Skills saved.");
      if (operation === "add") setCatalog((current) => uniqueSkills([...current, ...confirmed]));
      else requestAnimationFrame(() => section.current?.querySelector<HTMLButtonElement>("[data-add-skills]")?.focus());
      return true;
    } catch { onUnavailable?.(); setError("The skill change could not be confirmed. Your previous list is still shown. Retry or refresh skills."); setRetry({ name, operation }); setStatus(""); return false; }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section ref={section} className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby="profile-skills-title" aria-busy={pending}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h2 id="profile-skills-title" className="section-title flex items-center gap-2.5"><Icon name="code" className="size-5 text-accent" />Skills</h2><p aria-live="polite" className="metadata-text mt-1">{skills === null ? "Saved skills unavailable" : skills.length + " saved skills"}</p></div>
      <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">
        <Button data-add-skills onClick={() => setDrawerOpen(true)} disabled={skills === null}>Add skills</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => { void refreshSkills(); }}>Refresh skills</Button>
      </div>
    </div>
    {skills !== null && (skills.length ? <ul aria-label="Your skills" className="mt-5 flex flex-wrap gap-2">{skills.map((skill) => <li key={normalizeSkillName(skill.name)} className="max-w-full"><SkillChip skill={skill} disabled={pending} onRemove={() => { void mutate(skill.name, "remove"); }} /></li>)}</ul> : <p className="mt-5 text-sm text-muted">No skills added yet.</p>)}
    {!drawerOpen && status && <p role="status" className="mt-4 text-sm leading-6">{status}</p>}
    {!drawerOpen && error && <div className="mt-5"><ErrorState variant="danger" title="Skills could not be confirmed" description={error} action={retry ? <Button variant="secondary" disabled={pending} onClick={() => { void mutate(retry.name, retry.operation); }}>Retry skill change</Button> : <Button variant="secondary" disabled={pending} onClick={() => { void refreshSkills(); }}>Retry loading skills</Button>} /></div>}
    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add skills" size="skills" keepMounted footer={<Button className="w-full" onClick={() => setDrawerOpen(false)}>Done</Button>}>
    <SkillAutocomplete mode="drawer" feedbackContent={<>{status && <p role="status" className="text-sm">{status}</p>}{error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="secondary" disabled={pending} onClick={() => { if (retry) void mutate(retry.name, retry.operation); else void refreshSkills(); }}>Retry</Button></div>}</>} catalog={catalog} selected={skills ?? []} loading={catalogLoading} error={catalogError} disabled={pending || skills === null} onRetry={() => { void refreshCatalog(); }} onAdd={(name) => mutate(name, "add")} />
    </Drawer>
  </section>;
}
