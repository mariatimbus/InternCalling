"use client";

import { useRef, useState } from "react";
import type { Profile, Skill } from "@/lib/api/types";
import { refreshCompletion } from "@/app/(workspace)/profile/completion-actions";
import { ProfileCompletion } from "./profile-completion";
import { ProfileEditor } from "./profile-editor";
import { ProfileSkills } from "./profile-skills";
import { PublicationsSection } from "./publications-section";
import { LanguagesSection } from "./languages-section";
import { HonoursSection } from "./honours-section";
import { CertificatesSection } from "./certificates-section";
import { ProjectsSection } from "./projects-section";
import { ExperienceSection } from "./experience-section";
import { ResumePdfSection } from "./resume-pdf-section";
import { ResumeEditor } from "./resume-editor";

export function ProfileHub({ initialProfile, initialSkills }: { initialProfile: Profile; initialSkills: Skill[] | null }) {
  const [profile, setProfile] = useState(initialProfile);
  const [skills, setSkills] = useState(initialSkills);
  const [profileKnown, setProfileKnown] = useState(true);
  const [skillsKnown, setSkillsKnown] = useState(initialSkills !== null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  async function retry() {
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
  }
  return <>
    <ProfileCompletion profile={profileKnown ? profile : null} skills={skillsKnown ? skills : null} pending={pending} onRetry={() => { void retry(); }} />
    <ProfileEditor initialProfile={initialProfile} onConfirmed={(saved) => { revision.current++; setProfile(saved); setProfileKnown(true); }} onUnavailable={() => { revision.current++; setProfileKnown(false); }} />
    <div><ProfileSkills initialSkills={initialSkills} persistedSkills={skills} onConfirmed={(saved) => { revision.current++; setSkills(saved); setSkillsKnown(true); }} onUnavailable={() => { revision.current++; setSkillsKnown(false); }} /></div>
    <ResumePdfSection linkInitiallyOpen={!!initialProfile.resume_url}><ResumeEditor initialResumeUrl={initialProfile.resume_url} /></ResumePdfSection>
    <ExperienceSection />
    <ProjectsSection />
    <CertificatesSection />
    <HonoursSection />
    <LanguagesSection />
    <PublicationsSection />
  </>;
}
