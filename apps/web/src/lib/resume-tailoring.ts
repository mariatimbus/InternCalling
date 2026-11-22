/** PROPOSED contracts only. No live generation/persistence/export endpoints are agreed. */
import { safeResumeAccess, type ResumeAccess } from "./resume-pdf";
export type TailoringRef={id:string;revision:string};
export const tailoringSections=["profile","skills","experience","projects","certificates","honours","languages","publications"] as const;
export type TailoringSection=typeof tailoringSections[number];
export type TailoringJob=TailoringRef&{title:string;organization:string;applicationUrl:string;requirements:{id:string;text:string}[]};
export type TailoringFact=TailoringRef&{section:TailoringSection;title:string;text:string};
export type TailoringContext={job:TailoringJob;source:{profile:TailoringRef;resume:TailoringRef;facts:TailoringFact[]}};
export type TailoringScope={job:TailoringRef;profile:TailoringRef;resume:TailoringRef};
export type TailoringBlock={id:string;section:TailoringSection;title:string;text:string;sourceRefs:TailoringRef[];origin:"source"|"user";wording:"proposed"|"source"|"user";decision:"pending"|"accepted"|"excluded"};
export type TailoringDraft={id:string;revision:string;scope:TailoringScope;blocks:TailoringBlock[];missingRequirements:string[];warnings:string[]};
export type TailoringGeneration={id:string;scope:TailoringScope;status:"queued"|"running"|"ready"|"failed";draft?:TailoringDraft};
export type TailoringApproval={id:string;draft:TailoringRef;scope:TailoringScope};
export type TailoringExport={id:string;approvalId:string;draft:TailoringRef;status:"queued"|"running"|"ready"|"failed"};
export type TailoringDownload={exportId:string;draft:TailoringRef;access:ResumeAccess;content:"approved-resume"|"fixed-sample"};
export type TailoringRequest={requestId:string;signal:AbortSignal};
export interface ResumeTailoringService{
  load(jobId:string,options:{signal:AbortSignal}):Promise<TailoringContext>;
  generate(scope:TailoringScope,options:TailoringRequest):Promise<TailoringGeneration>;
  generationStatus(id:string,options:{signal:AbortSignal}):Promise<TailoringGeneration>;
  save(draft:TailoringRef,blocks:TailoringBlock[],options:TailoringRequest):Promise<TailoringDraft>;
  approve(draft:TailoringRef,options:TailoringRequest):Promise<TailoringApproval>;
  exportPdf(approval:TailoringApproval,options:TailoringRequest):Promise<TailoringExport>;
  exportStatus(id:string,options:{signal:AbortSignal}):Promise<TailoringExport>;
  download(id:string,options:{signal:AbortSignal}):Promise<TailoringDownload>;
}
export class TailoringConflict extends Error{}
export class TailoringRejected extends Error{}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown,max=6000):value is string=>typeof value==="string"&&!!value.trim()&&value.length<=max;
export const isTailoringRef=(value:unknown):value is TailoringRef=>record(value)&&text(value.id,255)&&text(value.revision,255);
export const sameTailoringRef=(a:TailoringRef,b:TailoringRef)=>a.id===b.id&&a.revision===b.revision;
export const contextScope=(context:TailoringContext):TailoringScope=>({job:{id:context.job.id,revision:context.job.revision},profile:{...context.source.profile},resume:{...context.source.resume}});
export const sameTailoringScope=(a:TailoringScope,b:TailoringScope)=>sameTailoringRef(a.job,b.job)&&sameTailoringRef(a.profile,b.profile)&&sameTailoringRef(a.resume,b.resume);
export const isTailoringScope=(value:unknown):value is TailoringScope=>record(value)&&isTailoringRef(value.job)&&isTailoringRef(value.profile)&&isTailoringRef(value.resume);
export function isTailoringContext(value:unknown):value is TailoringContext{
  if(!record(value)||!record(value.job)||!isTailoringRef(value.job)||!record(value.source))return false;
  const job=value.job as TailoringJob,source=value.source;
  return text(job.title,255)&&text(job.organization,255)&&typeof job.applicationUrl==="string"&&Array.isArray(job.requirements)&&job.requirements.length<=100&&new Set(job.requirements.map(row=>row?.id)).size===job.requirements.length&&job.requirements.every(row=>text(row?.id,255)&&text(row.text))&&isTailoringRef(source.profile)&&isTailoringRef(source.resume)&&Array.isArray(source.facts)&&source.facts.length<=100&&new Set(source.facts.map(row=>row?.id)).size===source.facts.length&&source.facts.every(row=>isTailoringRef(row)&&tailoringSections.includes((row as TailoringFact).section)&&text((row as TailoringFact).title,255)&&text((row as TailoringFact).text));
}
export function validateTailoringBlocks(blocks:TailoringBlock[],context:TailoringContext):Record<string,string>{
  const errors:Record<string,string>={};
  if(!Array.isArray(blocks)||blocks.length>100)return {draft:"Use at most 100 resume items."};
  const ids=new Set<string>();
  for(const [index,block]of blocks.entries()){
    const path="block-"+index;
    if(!record(block)||!text(block.id,255)||ids.has(block.id)||!tailoringSections.includes(block.section)||!text(block.title,255)||!text(block.text)||!["source","user"].includes(block.origin)||!["proposed","source","user"].includes(block.wording)||!["pending","accepted","excluded"].includes(block.decision)||!Array.isArray(block.sourceRefs)){errors[path]="Review the item title, text and decision.";continue;}
    ids.add(block.id);
    if(block.origin==="source"&&(!block.sourceRefs.length||block.sourceRefs.some(ref=>!isTailoringRef(ref)||!context.source.facts.some(fact=>sameTailoringRef(fact,ref)&&fact.section===block.section))))errors[path]="This proposal has a missing or stale source reference. Reload source data.";
    if(block.origin==="user"&&(block.sourceRefs.length||block.wording!=="user"))errors[path]="Manual additions must stay labelled user-provided, not source-verified.";
  }
  return errors;
}
export function isTailoringDraft(value:unknown,context:TailoringContext,generated=false):value is TailoringDraft{
  return record(value)&&text(value.id,255)&&text(value.revision,255)&&isTailoringScope(value.scope)&&sameTailoringScope(value.scope,contextScope(context))&&Array.isArray(value.blocks)&&!Object.keys(validateTailoringBlocks(value.blocks as TailoringBlock[],context)).length&&(!generated||value.blocks.every(block=>block.origin==="source"))&&Array.isArray(value.missingRequirements)&&value.missingRequirements.every(id=>typeof id==="string"&&context.job.requirements.some(row=>row.id===id))&&Array.isArray(value.warnings)&&value.warnings.every(warning=>typeof warning==="string");
}
export function sourceWording(block:TailoringBlock,context:TailoringContext):string{return block.sourceRefs.map(ref=>context.source.facts.find(fact=>sameTailoringRef(fact,ref))?.text??"").filter(Boolean).join("\n\n");}
export function approvalErrors(blocks:TailoringBlock[]):Record<string,string>{return !blocks.some(block=>block.decision==="accepted")?{approval:"Accept at least one resume item before approval."}:blocks.some(block=>block.decision==="pending")?{approval:"Accept, use source wording, or exclude every pending item before approving."}:{};}
export function validTailoringDownload(value:TailoringDownload,job:TailoringExport,preview:boolean):boolean{return !!value&&value.exportId===job.id&&isTailoringRef(value.draft)&&sameTailoringRef(value.draft,job.draft)&&safeResumeAccess(value.access,preview)&&(preview||value.content==="approved-resume")&&["approved-resume","fixed-sample"].includes(value.content);}
