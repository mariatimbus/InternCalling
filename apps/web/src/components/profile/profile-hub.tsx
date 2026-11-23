"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProfileServices, type WorkspaceCapabilities } from "@/lib/profile-services";
import { ResumeReviewFlow } from "./resume-review-flow";
import type { ResumeIdentity } from "@/lib/resume-pdf";
import type { ResumePdfState } from "@/lib/resume-pdf-controller";
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
  const router = useRouter();
  const [capabilities, setCapabilities] = useState<WorkspaceCapabilities | null>(null);
  const [collectionEpoch, setCollectionEpoch] = useState(0);
  const [source, setSource] = useState<ResumeIdentity | undefined>();
  const [profile, setProfile] = useState(initialProfile);
  const [skills, setSkills] = useState(initialSkills);
  const [profileKnown, setProfileKnown] = useState(true);
  const [skillsKnown, setSkillsKnown] = useState(initialSkills !== null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
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
  const reviewConfirmed = useCallback(() => { setCollectionEpoch(value => value + 1); changed(); router.refresh(); }, [changed, router]);
  // Factory stores this event callback; it never reads React refs during render.
  // eslint-disable-next-line react-hooks/refs
  const services = useMemo(() => createProfileServices({ changed }), [changed]);
  useEffect(() => { const operation = new AbortController(); void services.capabilities(operation.signal).then(setCapabilities).catch(() => { if (!operation.signal.aborted) setCapabilities(null); }); return () => operation.abort(); }, [services]);
  const pdfChanged = useCallback((state: ResumePdfState) => {
    const next = state.status === "ready" && !state.selected && !state.busy && !state.deleting ? state.confirmed : null;
    setSource(current => current?.id === next?.id && current?.revision === next?.revision ? current : next ? { id: next.id, revision: next.revision } : undefined);
  }, []);
  return <>
    <ProfileCompletion profile={profileKnown ? profile : null} skills={skillsKnown ? skills : null} pending={pending} onRetry={() => { void retry(); }} />
    <ProfileEditor initialProfile={initialProfile} persistedProfile={profile} onConfirmed={(saved) => { revision.current++; setProfile(saved); setProfileKnown(true); }} onUnavailable={() => { revision.current++; setProfileKnown(false); }} />
    <div><ProfileSkills initialSkills={initialSkills} persistedSkills={skills} onConfirmed={(saved) => { revision.current++; setSkills(saved); setSkillsKnown(true); }} onUnavailable={() => { revision.current++; setSkillsKnown(false); }} /></div>
    <ResumePdfSection service={services.pdf} uploadAvailable={capabilities?.upload === true} parsingAvailable={capabilities?.parsing === true} onStateChange={pdfChanged} linkInitiallyOpen={!!initialProfile.resume_url}><ResumeEditor initialResumeUrl={initialProfile.resume_url} /></ResumePdfSection>
    {source && capabilities?.parsing && <ResumeReviewFlow service={services.review} source={source} onConfirmed={reviewConfirmed} />}
    <ExperienceSection key={"Experience-" + collectionEpoch} service={services.experience} />
    <ProjectsSection key={"Projects-" + collectionEpoch} service={services.projects} />
    <CertificatesSection key={"Certificates-" + collectionEpoch} service={services.certificates} />
    <HonoursSection key={"Honours-" + collectionEpoch} service={services.honours} />
    <LanguagesSection key={"Languages-" + collectionEpoch} service={services.languages} />
    <PublicationsSection key={"Publications-" + collectionEpoch} service={services.publications} />
  </>;
}
