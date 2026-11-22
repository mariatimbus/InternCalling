/** PROPOSED review contracts only. No live endpoints/schema are agreed. */
import { editableProfileFields, validateProfileDraft, validateProfilePatch, type ProfileDraft, type ProfileField, type ProfilePatch } from "./profile-edit";
import { emptyExperience, validateExperience, type ExperienceDraft } from "./experience";
import { emptyProject, validateProject, type ProjectDraft } from "./projects";
import { emptyCertificate, validateCertificate, type CertificateDraft } from "./certificates";
import { emptyHonour, validateHonour, type HonourDraft } from "./honours";
import { emptyLanguage, validateLanguage, normalizeLanguageName, type LanguageDraft } from "./languages";
import { emptyPublication, validatePublication, type PublicationDraft } from "./publications";
import { normalizeSkillName, validateSkillName } from "./profile-skills";
import type { ResumeIdentity } from "./resume-pdf";
export const reviewSections = ["experience", "projects", "certificates", "honours", "languages", "publications"] as const;
export type ReviewSection = typeof reviewSections[number];
export type ReviewDrafts = { experience: ExperienceDraft; projects: ProjectDraft; certificates: CertificateDraft; honours: HonourDraft; languages: LanguageDraft; publications: PublicationDraft };
export type ReviewValue = string | boolean | string[];
export type ReviewValues = Record<string, ReviewValue>;
export const reviewDefaults: ReviewDrafts = { experience: emptyExperience(), projects: emptyProject(), certificates: emptyCertificate(), honours: emptyHonour(), languages: emptyLanguage(), publications: emptyPublication() };
export type NullableReviewValues<D> = { [K in keyof D]: D[K] | null };
export type SavedReviewEntry<S extends ReviewSection = ReviewSection> = { id: string; revision: number; position: number; values: NullableReviewValues<ReviewDrafts[S]> };
export type ReviewSnapshot = { profileRevision: string; profile: ProfileDraft; skills: string[]; collections: { [S in ReviewSection]: SavedReviewEntry<S>[] } };
export type ParsedCandidate = { [S in ReviewSection]: { key: string; section: S; values: { [K in keyof ReviewDrafts[S]]?: ReviewDrafts[S][K] | null }; warnings: string[] } }[ReviewSection];
export type ParsingJob = { id: string; source: ResumeIdentity; profileRevision: string; status: "queued" | "processing" | "ready" | "failed"; message?: string };
export type ParsingResult = { jobId: string; source: ResumeIdentity; snapshot: ReviewSnapshot; proposed: { profile: Partial<Record<ProfileField, string | null>>; skills: string[]; collections: ParsedCandidate[] }; warnings: string[] };
export type ReviewChoice = { apply: boolean; value: ReviewValue | undefined };
export type ReviewDraft = { profile: Record<ProfileField, ReviewChoice>; skills: { key: string; name: string; apply: boolean }[]; collections: { key: string; decision: "skip" | "add" | "update"; targetId: string; fields: Record<string, ReviewChoice> }[] };
export type CollectionChange = { [S in ReviewSection]: { section: S; proposalKey: string; operation: "add" | "update"; target?: { id: string; revision: number }; fields: Partial<ReviewDrafts[S]> } }[ReviewSection];
export type ReviewChanges = { requestId: string; jobId: string; source: ResumeIdentity; profileRevision: string; profile: ProfilePatch; skills: { add: string[] }; collections: CollectionChange[] };
export type ReviewReceipt = { requestId: string; jobId: string; source: ResumeIdentity; snapshot: ReviewSnapshot };
export interface ResumeReviewService {
  start(source: ResumeIdentity, options: { signal: AbortSignal }): Promise<ParsingJob>;
  status(jobId: string, options: { signal: AbortSignal }): Promise<ParsingJob>;
  result(jobId: string, options: { signal: AbortSignal }): Promise<unknown>;
  confirm(changes: ReviewChanges, options: { signal: AbortSignal }): Promise<ReviewReceipt>;
}
export class ResumeReviewConflict extends Error {}
/** A definite pre-commit rejection is safe to edit; unknown errors require retrying the same request ID. */
export class ResumeReviewRejected extends Error {}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown, max = 100): value is string[] => Array.isArray(value) && value.length <= max && value.every(item => typeof item === "string" && item.length <= 5000);
const identity = (value: unknown): value is ResumeIdentity => record(value) && typeof value.id === "string" && !!value.id && Number.isInteger(value.revision) && Number(value.revision) > 0;
export const sameResume = (a: ResumeIdentity, b: ResumeIdentity) => a.id === b.id && a.revision === b.revision;
export function isParsingJob(value: unknown): value is ParsingJob { return record(value) && typeof value.id === "string" && !!value.id && identity(value.source) && typeof value.profileRevision === "string" && !!value.profileRevision && ["queued", "processing", "ready", "failed"].includes(String(value.status)) && (value.message === undefined || typeof value.message === "string"); }
function valuesValid(section: ReviewSection, value: unknown, partial: boolean, nullable = true): boolean {
  if (!record(value)) return false;
  const defaults = reviewDefaults[section] as ReviewValues;
  if (Object.keys(value).some(key => !Object.hasOwn(defaults,key))) return false;
  return Object.entries(defaults).every(([key, sample]) => {
    const item = value[key]; if (partial && !Object.hasOwn(value,key)) return true; if (nullable && item === null || partial && nullable && item === undefined) return true;
    return Array.isArray(sample) ? strings(item) : typeof item === typeof sample && (typeof item !== "string" || item.length <= 30000);
  });
}
export function isReviewSnapshot(value: unknown): value is ReviewSnapshot {
  if (!record(value) || typeof value.profileRevision !== "string" || !value.profileRevision || !record(value.profile) || !strings(value.skills) || !record(value.collections)) return false;
  if (Object.keys(value.profile).some(key => !editableProfileFields.includes(key as ProfileField)) || !editableProfileFields.every(key => typeof (value.profile as Record<string,unknown>)[key] === "string") || Object.keys(validateProfileDraft(value.profile as ProfileDraft)).length) return false;
  return reviewSections.every(section => {
    const rows = (value.collections as Record<string,unknown>)[section];
    return Array.isArray(rows) && rows.length <= 100 && new Set(rows.map(row => row?.id)).size === rows.length && rows.every(row => { if(!record(row)||!identity(row)) return false; const entry=row as typeof row & {position:unknown;values:unknown}; return typeof entry.position === "number" && Number.isFinite(entry.position) && valuesValid(section, entry.values, false); });
  });
}
export function isParsingResult(value: unknown): value is ParsingResult {
  if (!record(value) || typeof value.jobId !== "string" || !value.jobId || !identity(value.source) || !isReviewSnapshot(value.snapshot) || !record(value.proposed) || !record(value.proposed.profile) || !strings(value.proposed.skills) || !strings(value.warnings)) return false;
  if (!Object.entries(value.proposed.profile).every(([key,item]) => editableProfileFields.includes(key as ProfileField) && (item === null || typeof item === "string" && item.length <= 30000))) return false;
  const candidates = value.proposed.collections;
  return Array.isArray(candidates) && candidates.length <= 100 && new Set(candidates.map(row => row?.key)).size === candidates.length && candidates.every(row => record(row) && typeof row.key === "string" && /^[a-zA-Z0-9_-]+$/.test(row.key) && reviewSections.includes(row.section as ReviewSection) && valuesValid(row.section as ReviewSection,row.values,true) && strings(row.warnings));
}
export const providedReviewValue = (value: unknown): boolean => value !== undefined && value !== null && (typeof value !== "string" || !!value.trim()) && (!Array.isArray(value) || value.length > 0);
export function createReviewDraft(result: ParsingResult): ReviewDraft {
  return { profile: Object.fromEntries(editableProfileFields.map(key => [key,{apply:false,value:result.proposed.profile[key] ?? undefined}])) as ReviewDraft["profile"], skills: result.proposed.skills.map((name,index)=>({key:"skill-"+index,name,apply:false})), collections: result.proposed.collections.map(candidate=>({key:candidate.key,decision:"skip",targetId:"",fields:Object.fromEntries(Object.keys(reviewDefaults[candidate.section]).map(key=>[key,{apply:false,value:(candidate.values as ReviewValues)[key] ?? undefined}]))})) };
}
/** Defaults are validator placeholders only, never persisted as extracted facts. */
function validationValues(section: ReviewSection, values: Record<string,ReviewValue|null|undefined>): ReviewValues {
  return Object.fromEntries(Object.entries(reviewDefaults[section]).map(([key,sample])=>[key,values[key] ?? structuredClone(sample)]));
}
export function reviewCollectionErrors(section: ReviewSection, values: ReviewValues): Record<string,string> {
  switch(section) {
    case "experience": {
      const errors = validateExperience(values as ExperienceDraft);
      // Parsing may genuinely omit dates; preserve unknown dates instead of inventing them.
      if (!(values.startDate as string).trim()) delete errors.startDate;
      if (!(values.endDate as string).trim() && !values.current) delete errors.endDate;
      return errors;
    }
    case "projects": return validateProject(values as ProjectDraft);
    case "certificates": return validateCertificate(values as CertificateDraft);
    case "honours": return validateHonour(values as HonourDraft);
    case "languages": return validateLanguage(values as LanguageDraft);
    case "publications": return validatePublication(values as PublicationDraft);
  }
}
export function buildReviewChanges(result: ParsingResult, draft: ReviewDraft, requestId: string): { changes?: ReviewChanges; errors: Record<string,string> } {
  const errors: Record<string,string> = {}, raw: Record<string,string|number|null> = {};
  for (const key of editableProfileFields) {
    const choice = draft.profile[key]; if (!choice.apply) continue;
    if (typeof choice.value !== "string") { errors["profile."+key]="Enter a value or explicitly leave blank to clear it."; continue; }
    const text = choice.value.trim();
    if (text === result.snapshot.profile[key].trim()) continue;
    raw[key] = text ? key === "graduation_year" ? Number(text) : text : null;
    if (key === "graduation_year" && text && !/^\d+$/.test(text)) errors["profile."+key]="Enter a whole graduation year.";
  }
  const validated = validateProfilePatch(raw);
  for (const [key,error] of Object.entries(validated.fields ?? {})) errors["profile."+key]=error;
  const add: string[] = [], savedSkills = new Set(result.snapshot.skills.map(normalizeSkillName));
  for (const choice of draft.skills.filter(row=>row.apply)) {
    const skill=validateSkillName(choice.name);
    if (!skill.name) errors["skills."+choice.key]=skill.error ?? "Enter a skill.";
    else if (!savedSkills.has(skill.name) && !add.includes(skill.name)) add.push(skill.name);
  }
  const collections: CollectionChange[] = [], targets = new Set<string>();
  for (const choice of draft.collections) {
    if (choice.decision === "skip") continue;
    const candidate=result.proposed.collections.find(row=>row.key===choice.key);
    if (!candidate) { errors[choice.key]="Proposal is no longer available."; continue; }
    const section=candidate.section;
    const target=result.snapshot.collections[section].find(row=>row.id===choice.targetId);
    if (choice.decision === "update" && !target) { errors[choice.key]="Choose the exact saved entry to update, or add a separate entry."; continue; }
    if (choice.decision === "update" && target) {
      const key=section+":"+target.id;
      if (targets.has(key)) { errors[choice.key]="Two proposals target the same entry. Choose one update or add separate entries."; continue; }
      targets.add(key);
    }
    const fields: ReviewValues = {};
    for (const [key,field] of Object.entries(choice.fields)) if (field.apply) {
      const sample=(reviewDefaults[section] as ReviewValues)[key];
      if (sample === undefined || field.value === undefined || typeof field.value !== typeof sample || Array.isArray(sample) !== Array.isArray(field.value)) errors[choice.key+"."+key]="Choose a value or skip this field.";
      else fields[key]=typeof field.value === "string" ? field.value.trim() : structuredClone(field.value);
    }
    if (!Object.keys(fields).length) { errors[choice.key]="Select at least one field for this entry."; continue; }
    const merged={...(choice.decision==="update" && target ? target.values : reviewDefaults[section]),...fields} as ReviewValues;
    for (const [key,error] of Object.entries(reviewCollectionErrors(section,validationValues(section,merged)))) errors[choice.key+"."+key]=error;
    collections.push({section,proposalKey:choice.key,operation:choice.decision,target:choice.decision==="update" && target ? {id:target.id,revision:target.revision} : undefined,fields} as CollectionChange);
  }
  if (!Object.keys(raw).length && !add.length && !collections.length && !Object.keys(errors).length) errors.review="Select at least one change before confirming.";
  return Object.keys(errors).length ? {errors} : {errors,changes:{requestId,jobId:result.jobId,source:{...result.source},profileRevision:result.snapshot.profileRevision,profile:validated.patch ?? {},skills:{add},collections}};
}
/** Preview/review helper only; validates against a copy before committing atomically. */
export function applyReviewChanges(snapshot: ReviewSnapshot, changes: ReviewChanges): ReviewSnapshot {
  if (snapshot.profileRevision !== changes.profileRevision) throw new ResumeReviewConflict("Stale profile");
  const next=structuredClone(snapshot), profile=validateProfilePatch(changes.profile);
  if (!profile.patch || profile.error) throw new ResumeReviewRejected("Invalid profile fields");
  for (const [key,value] of Object.entries(profile.patch)) next.profile[key as ProfileField]=value?.toString() ?? "";
  for (const name of changes.skills.add) { const skill=validateSkillName(name); if (!skill.name) throw new ResumeReviewRejected("Invalid skill"); if (!next.skills.some(saved=>normalizeSkillName(saved)===skill.name)) next.skills.push(skill.name); }
  for (const change of changes.collections) {
    if (!reviewSections.includes(change.section) || !valuesValid(change.section,change.fields,true,false) || !Object.keys(change.fields).length) throw new ResumeReviewRejected("Invalid collection fields");
    const rows=next.collections[change.section] as SavedReviewEntry[];
    const target=change.operation==="update" ? rows.find(row=>row.id===change.target?.id) : undefined;
    if (change.operation==="update" && (!target || target.revision !== change.target?.revision)) throw new ResumeReviewConflict("Stale entry");
    if (!["add","update"].includes(change.operation)) throw new ResumeReviewRejected("Invalid decision");
    const values={...(target?.values ?? Object.fromEntries(Object.keys(reviewDefaults[change.section]).map(key=>[key,null]))),...change.fields};
    if (Object.keys(reviewCollectionErrors(change.section,validationValues(change.section,values))).length) throw new ResumeReviewRejected("Invalid collection value");
    if (change.section === "languages" && rows.some(row=>row.id!==target?.id && typeof (row.values as LanguageDraft).name === "string" && normalizeLanguageName((row.values as LanguageDraft).name)===normalizeLanguageName((values as LanguageDraft).name))) throw new ResumeReviewRejected("Language already exists");
    if (target) { target.values=values as SavedReviewEntry["values"]; target.revision++; }
    else rows.push({id:"review-added-"+change.section+"-"+(Math.max(0,...rows.map(row=>row.position))+1)+"-"+change.proposalKey,revision:1,position:Math.max(0,...rows.map(row=>row.position))+1,values:values as SavedReviewEntry["values"]});
  }
  next.profileRevision=snapshot.profileRevision+"-next";
  return next;
}
