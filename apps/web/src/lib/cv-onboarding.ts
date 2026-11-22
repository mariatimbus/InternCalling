/** PROPOSED capability/completion adapter; no new live routes. */
import { validateOnboarding, isProfileComplete, type OnboardingDraft, type OnboardingCompletionProfile } from "./onboarding";
import type { ProfileDraft } from "./profile-edit";
import type { ParsingResult, ReviewDraft, ReviewChanges, ReviewSnapshot, ResumeReviewService } from "./resume-review";
import type { ResumePdfService } from "./resume-pdf";
export const cvRequiredFields = ["degree_level","university","field_of_study","graduation_year","location"] as const;
export type CvOnboardingServices = {
  capabilities: { upload:boolean; parsing:boolean; confirmation:boolean };
  pdf: ResumePdfService;
  review: ResumeReviewService;
  manual: {
    load(options:{signal:AbortSignal}):Promise<ReviewSnapshot>;
    confirm(draft:OnboardingDraft,options:{profileRevision:string;requestId:string;signal:AbortSignal}):Promise<ReviewSnapshot>;
  };
};
export const onboardingFromSnapshot = (profile:ProfileDraft,skills:string[]):OnboardingDraft => ({ degree_level:profile.degree_level,university:profile.university,field_of_study:profile.field_of_study,graduation_year:profile.graduation_year,location:profile.location,skills:[...skills] });
export function onboardingReviewErrors(result:ParsingResult,draft:ReviewDraft):Record<string,string>{
  const effective={...result.snapshot.profile};
  for(const key of cvRequiredFields){const choice=draft.profile[key];if(choice.apply&&typeof choice.value==="string")effective[key]=choice.value;}
  const skills=[...new Set([...result.snapshot.skills,...draft.skills.filter(row=>row.apply).map(row=>row.name.trim().toLowerCase())])];
  return Object.fromEntries(Object.entries(validateOnboarding(onboardingFromSnapshot(effective,skills))).map(([key,error])=>[key==="skills"?"review":"profile."+key,error]));
}
export function cvConfirmationErrors(snapshot:ReviewSnapshot,changes:ReviewChanges):Record<string,string>{
  const profile={...snapshot.profile};
  for(const key of cvRequiredFields)if(Object.hasOwn(changes.profile,key))profile[key]=changes.profile[key]?.toString()??"";
  const fields=validateOnboarding(onboardingFromSnapshot(profile,[...new Set([...snapshot.skills,...changes.skills.add])]));
  return Object.fromEntries(Object.entries(fields));
}
/** Only authoritative service snapshots can reach this check; local drafts do not count. */
export function isConfirmedOnboardingComplete(snapshot:ReviewSnapshot):boolean{
  const p=snapshot.profile;
  return isProfileComplete({degree_level:p.degree_level as OnboardingCompletionProfile["degree_level"],university:p.university,field_of_study:p.field_of_study,graduation_year:p.graduation_year.trim()?Number(p.graduation_year):null,location:p.location});
}
