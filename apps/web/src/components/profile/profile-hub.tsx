"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createProfileServices } from "@/lib/profile-services";
import type { Profile, Skill } from "@/lib/api/types";
import { completionItems, isProfileFieldComplete } from "@/lib/profile-completion";
import { refreshCompletion } from "@/app/(workspace)/profile/completion-actions";
import { Button } from "@/components/ui/button";
import { ProfileCompletion } from "./profile-completion";
import { ProfileEditor, type ProfileEditorHandle } from "./profile-editor";
import { ProfileSkills } from "./profile-skills";
import { PublicationsSection } from "./publications-section";
import { LanguagesSection } from "./languages-section";
import { HonoursSection } from "./honours-section";
import { CertificatesSection } from "./certificates-section";
import { ProjectsSection } from "./projects-section";
import { ExperienceSection } from "./experience-section";

export function ProfileHub({ initialProfile, initialSkills, preferences, insightsEnabled = false, contactEmail }: {
  initialProfile: Profile; initialSkills: Skill[] | null; preferences?: ReactNode; insightsEnabled?: boolean; contactEmail?: string;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [skills, setSkills] = useState(initialSkills);
  const [profileKnown, setProfileKnown] = useState(true);
  const [skillsKnown, setSkillsKnown] = useState(initialSkills !== null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const editor = useRef<ProfileEditorHandle>(null);
  const skillsSection = useRef<HTMLDivElement>(null);
  const retry = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true);
    const startedAt = revision.current;
    try {
      const result = await refreshCompletion();
      if (startedAt !== revision.current) return;
      if (result.profile) setProfile(result.profile);
      if (result.skills) setSkills(result.skills);
      setProfileKnown(!!result.profile); setSkillsKnown(!!result.skills);
    } catch { if (startedAt === revision.current) { setProfileKnown(false); setSkillsKnown(false); } }
    finally { inFlight.current = false; setPending(false); }
  }, []);
  const changed = useCallback(() => { void retry(); }, [retry]);
  // Factory stores this event callback; it never reads React refs during render.
  // eslint-disable-next-line react-hooks/refs
  const services = useMemo(() => createProfileServices({ changed }), [changed]);
  const fields = insightsEnabled && profileKnown ? completionItems.filter(
    (item) => item.key !== "skills" && !isProfileFieldComplete(profile, item.key),
  ) : [];
  const addSkills = insightsEnabled && skillsKnown && skills?.length === 0;
  return <>
    <nav aria-label="Profile sections" className="my-6 flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-3 text-sm text-muted">
      {[["profile-overview", "Overview"], ["profile-education", "Education"], ["profile-experience", "Experience"], ["profile-skills", "Skills"]].map(([id, label]) =>
        <a key={id} href={"#" + id} className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground">{label}</a>)}
    </nav>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] xl:gap-12">
    <div data-profile-document className="min-w-0">
      <ProfileEditor ref={editor} initialProfile={initialProfile} persistedProfile={profile} contactEmail={contactEmail} onConfirmed={(saved) => { revision.current++; setProfile(saved); setProfileKnown(true); }} onUnavailable={() => { revision.current++; setProfileKnown(false); }} />
      <div id="profile-experience" data-profile-group><ExperienceSection service={services.experience} /></div>
      <div id="profile-skills" data-profile-group ref={skillsSection}><ProfileSkills initialSkills={initialSkills} persistedSkills={skills} onConfirmed={(saved) => { revision.current++; setSkills(saved); setSkillsKnown(true); }} onUnavailable={() => { revision.current++; setSkillsKnown(false); }} /></div>
      <ProjectsSection service={services.projects} />
      <CertificatesSection service={services.certificates} />
      <HonoursSection service={services.honours} />
      <LanguagesSection service={services.languages} />
      <PublicationsSection service={services.publications} />
      {preferences}
    </div>
    <aside aria-label="Profile completion" data-profile-sidebar className="min-w-0 space-y-5">
      <ProfileCompletion profile={profileKnown ? profile : null} skills={skillsKnown ? skills : null} pending={pending} onRetry={() => { void retry(); }} />
      {insightsEnabled && (fields.length > 0 || addSkills) && <section className="rounded-xl border border-line p-5" aria-labelledby="profile-insights-title">
        <h2 id="profile-insights-title" className="section-title">Profile Insights</h2>
        <ul className="mt-4 space-y-2">
          {fields.map(({ key, label }) => key !== "skills" && <li key={key}>
            <Button variant="secondary" size="sm" onClick={() => editor.current?.edit(key)}>{"Add " + label.toLowerCase()}</Button>
          </li>)}
          {addSkills && <li><Button variant="secondary" size="sm"
            onClick={() => skillsSection.current?.querySelector<HTMLButtonElement>("[data-add-skills]")?.click()}>Add skills</Button></li>}
        </ul>
      </section>}
    </aside>
    </div>
  </>;
}
