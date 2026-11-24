"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createProfileServices, type WorkspaceCapabilities } from "@/lib/profile-services";
import { ResumeReviewFlow } from "./resume-review-flow";
import type { ResumeIdentity } from "@/lib/resume-pdf";
import type { ResumePdfState } from "@/lib/resume-pdf-controller";
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
import { ResumePdfSection } from "./resume-pdf-section";

export function ProfileHub({ initialProfile, initialSkills, preferences, insightsEnabled = false }: {
  initialProfile: Profile; initialSkills: Skill[] | null; preferences?: ReactNode; insightsEnabled?: boolean;
}) {
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
  const reviewConfirmed = useCallback(() => { setCollectionEpoch(value => value + 1); changed(); router.refresh(); }, [changed, router]);
  // Factory stores this event callback; it never reads React refs during render.
  // eslint-disable-next-line react-hooks/refs
  const services = useMemo(() => createProfileServices({ changed }), [changed]);
  useEffect(() => { const operation = new AbortController(); void services.capabilities(operation.signal).then(setCapabilities).catch(() => { if (!operation.signal.aborted) setCapabilities(null); }); return () => operation.abort(); }, [services]);
  const pdfChanged = useCallback((state: ResumePdfState) => {
    const next = state.status === "ready" && !state.selected && !state.busy && !state.deleting ? state.confirmed : null;
    setSource(current => current?.id === next?.id && current?.revision === next?.revision ? current : next ? { id: next.id, revision: next.revision } : undefined);
  }, []);
  const fields = insightsEnabled && profileKnown ? completionItems.filter(
    (item) => item.key !== "skills" && !isProfileFieldComplete(profile, item.key),
  ) : [];
  const addSkills = insightsEnabled && skillsKnown && skills?.length === 0;
  return <>
    <div data-profile-completion-row className="mx-auto w-full max-w-xl shrink-0">
      <ProfileCompletion profile={profileKnown ? profile : null} skills={skillsKnown ? skills : null} pending={pending} onRetry={() => { void retry(); }} />
    </div>
    <div className="xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)] xl:items-start xl:gap-6">
    <section data-profile-left-column aria-label="Profile and resume" className="flow-root min-w-0 pb-4">
      <ProfileEditor ref={editor} initialProfile={initialProfile} persistedProfile={profile} compactDesktop onConfirmed={(saved) => { revision.current++; setProfile(saved); setProfileKnown(true); }} onUnavailable={() => { revision.current++; setProfileKnown(false); }} />
      <ResumePdfSection profileLayout service={services.pdf} uploadAvailable={capabilities?.upload === true}
        parsingAvailable={capabilities?.parsing === true} onStateChange={pdfChanged} />
    </section>
    <section aria-label="Experience and preferences" tabIndex={0}
      className="flow-root min-w-0 xl:h-full xl:overflow-y-auto xl:overscroll-y-contain xl:pb-9 xl:pr-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
      {insightsEnabled && (fields.length > 0 || addSkills) && <section className="mt-8 rounded-panel bg-card p-6 sm:p-9" aria-labelledby="profile-insights-title">
        <h2 id="profile-insights-title" className="section-title">Profile Insights</h2>
        <ul className="mt-4 space-y-2">
          {fields.map(({ key, label }) => key !== "skills" && <li key={key}>
            <Button variant="secondary" size="sm" onClick={() => editor.current?.edit(key)}>{"Add " + label.toLowerCase()}</Button>
          </li>)}
          {addSkills && <li><Button variant="secondary" size="sm"
            onClick={() => skillsSection.current?.querySelector<HTMLButtonElement>("[data-add-skills]")?.click()}>Add skills</Button></li>}
        </ul>
      </section>}
      {source && capabilities?.parsing && <ResumeReviewFlow service={services.review} source={source} onConfirmed={reviewConfirmed} />}
      <ExperienceSection key={"Experience-" + collectionEpoch} service={services.experience} />
      <ProjectsSection key={"Projects-" + collectionEpoch} service={services.projects} />
      <CertificatesSection key={"Certificates-" + collectionEpoch} service={services.certificates} />
      <HonoursSection key={"Honours-" + collectionEpoch} service={services.honours} />
      <LanguagesSection key={"Languages-" + collectionEpoch} service={services.languages} />
      <PublicationsSection key={"Publications-" + collectionEpoch} service={services.publications} />
      <div ref={skillsSection}><ProfileSkills initialSkills={initialSkills} persistedSkills={skills} onConfirmed={(saved) => { revision.current++; setSkills(saved); setSkillsKnown(true); }} onUnavailable={() => { revision.current++; setSkillsKnown(false); }} /></div>
      {preferences}
    </section>
    </div>
  </>;
}
