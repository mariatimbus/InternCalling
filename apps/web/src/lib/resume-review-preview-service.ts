import { reviewSections, reviewDefaults, applyReviewChanges, ResumeReviewConflict, ResumeReviewRejected, type ParsingJob, type ParsingResult, type ReviewSnapshot, type ResumeReviewService, type ReviewReceipt, type ReviewChanges } from "./resume-review";
export const syntheticReviewSource = { id: "synthetic-resume", revision: 1 };
/** Only synthetic hand-authored fixtures. Never extracted from a user's PDF. */
export function syntheticReviewSnapshot(): ReviewSnapshot {
  return { profileRevision:"synthetic-profile-1",profile:{headline:"Existing introduction",bio:"Keep this existing biography",degree_level:"bachelor",university:"Synthetic University",field_of_study:"Computing",graduation_year:"2027",location:"Synthetic City",linkedin_url:"",github_url:""},skills:["python"],collections:{
    experience:[{id:"saved-role-a",revision:1,position:1,values:{...reviewDefaults.experience,role:"Developer",organization:"Existing organization",startDate:"2023",endDate:"2024"}},{id:"saved-role-b",revision:1,position:2,values:{...reviewDefaults.experience,role:"Developer",organization:"Another organization",startDate:"2022",endDate:"2023"}}],
    projects:[{id:"saved-project",revision:1,position:1,values:{...reviewDefaults.projects,name:"Existing project",description:"Keep this project description",technologies:["python"]}}],certificates:[],honours:[],languages:[],publications:[] } };
}
export function syntheticParsingResult(job: ParsingJob, snapshot: ReviewSnapshot): ParsingResult {
  return {jobId:job.id,source:{...job.source},snapshot:structuredClone(snapshot),warnings:["Synthetic warning: extraction may omit information. Review every selected field."],proposed:{profile:{headline:"Proposed introduction",bio:null,university:null},skills:["JavaScript","python"],collections:[
    {key:"role",section:"experience",values:{role:"Developer",organization:"Proposed organization",startDate:"2024",endDate:null,description:"Synthetic responsibilities"},warnings:["End date and current status were not extracted. Choose the exact entry if updating."]},
    {key:"project",section:"projects",values:{name:"Proposed project",technologies:["python","typescript"]},warnings:[]},
    {key:"certificate",section:"certificates",values:{name:"Synthetic credential",organization:"Synthetic issuer",issueDate:"2025"},warnings:["Expiration is unknown, not evidence that the credential never expires."]},
    {key:"award",section:"honours",values:{title:"Synthetic distinction",receivedDate:"2024"},warnings:[]},
    {key:"language",section:"languages",values:{name:"English",cefr:null,native:null},warnings:["Proficiency and native status were not extracted."]},
    {key:"publication",section:"publications",values:{title:"Synthetic publication",authors:"Author Z\nAuthor A",publicationDate:"2025-02",doi:"10.1000/synthetic"},warnings:["This synthetic DOI is not claimed as registered or verified."]},
  ]}};
}
export function createResumeReviewPreviewService(options: {delayMs?:number; initialSnapshot?:ReviewSnapshot} = {}) {
  let snapshot=structuredClone(options.initialSnapshot??syntheticReviewSnapshot()),sequence=0;
  const source={...syntheticReviewSource};
  const jobs=new Map<string,ParsingJob>(),receipts=new Map<string,{payload:string;receipt:ReviewReceipt}>();
  let failure: "processing"|"result"|"save"|"uncertain"|"missing"|"invalid"|null=null;
  const wait=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException("Aborted","AbortError"));return;}
    const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(new DOMException("Aborted","AbortError"));};
    const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},options.delayMs??80);signal.addEventListener("abort",abort,{once:true});
  });
  const service:ResumeReviewService={
    async start(identity,{signal}){await wait(signal);signal.throwIfAborted();if(identity.id!==source.id||identity.revision!==source.revision)throw new ResumeReviewConflict("Stale resume");const job:ParsingJob={id:"synthetic-job-"+ ++sequence,source:{...source},profileRevision:snapshot.profileRevision,status:"processing"};jobs.set(job.id,job);return structuredClone(job);},
    async status(id,{signal}){await wait(signal);signal.throwIfAborted();const job=jobs.get(id);if(!job)throw new Error("Missing job");job.status=failure==="processing"?"failed":"ready";if(failure==="processing")failure=null;return structuredClone(job);},
    async result(id,{signal}){await wait(signal);signal.throwIfAborted();const job=jobs.get(id);if(!job||job.status!=="ready")throw new Error("Result unavailable");if(failure==="result"){failure=null;throw new Error("Simulated result failure");}if(failure==="missing"){failure=null;return null;}if(failure==="invalid"){failure=null;return {jobId:id,proposed:{profile:{headline:42}}};}return syntheticParsingResult(job,snapshot);},
    async confirm(changes:ReviewChanges,{signal}){
      await wait(signal);signal.throwIfAborted();const payload=JSON.stringify(changes),old=receipts.get(changes.requestId);
      if(old){if(old.payload!==payload)throw new ResumeReviewRejected("Request ID reused for different changes");return structuredClone(old.receipt);}
      const job=jobs.get(changes.jobId);if(!job||job.status!=="ready")throw new ResumeReviewRejected("Missing ready job");
      if(changes.source.id!==source.id||changes.source.revision!==source.revision||job.source.revision!==source.revision||job.profileRevision!==changes.profileRevision)throw new ResumeReviewConflict("Stale source/profile");
      if(failure==="save"){failure=null;throw new ResumeReviewRejected("Simulated pre-commit failure");}
      const next=applyReviewChanges(snapshot,changes);
      const receipt:ReviewReceipt={requestId:changes.requestId,jobId:changes.jobId,source:{...source},snapshot:next};snapshot=next;receipts.set(changes.requestId,{payload,receipt:structuredClone(receipt)});
      if(failure==="uncertain"){failure=null;throw new Error("Simulated lost response after commit");}
      return structuredClone(receipt);
    },
  };
  return Object.assign(service,{failNext(kind:NonNullable<typeof failure>){failure=kind;},changeProfile(){snapshot.profileRevision+="-external";},changeResume(){source.revision++;},getSource(){return {...source};},snapshot(){return structuredClone(snapshot);},setSource(identity:ParsingJob["source"]){source.id=identity.id;source.revision=identity.revision;},replaceSnapshot(expectedRevision:string,next:ReviewSnapshot){if(snapshot.profileRevision!==expectedRevision)throw new ResumeReviewConflict("Stale profile");snapshot=structuredClone(next);},sections:reviewSections});
}
