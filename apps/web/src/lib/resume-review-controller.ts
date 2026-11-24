import { isParsingJob, isParsingResult, isReviewSnapshot, sameResume, selectProposals, buildReviewChanges, ResumeReviewConflict, ResumeReviewRejected, type ParsingJob, type ParsingResult, type ReviewDraft, type ReviewChanges, type ReviewReceipt, type ResumeReviewService } from "./resume-review";
import type { ResumeIdentity } from "./resume-pdf";
export type ResumeReviewState = { phase:"idle"|"processing"|"review"|"confirm"|"saving"|"success"|"cancelled"; job:ParsingJob|null; result:ParsingResult|null; draft:ReviewDraft|null; changes:ReviewChanges|null; receipt:ReviewReceipt|null; errors:Record<string,string>; message:string; stale:boolean; uncertain:boolean; checking:boolean };
export const initialReviewState=():ResumeReviewState=>({phase:"idle",job:null,result:null,draft:null,changes:null,receipt:null,errors:{},message:"",stale:false,uncertain:false,checking:false});
export class ResumeReviewController {
  state=initialReviewState(); private listeners=new Set<(state:ResumeReviewState)=>void>();private active:AbortController|null=null;private disposed=false;
  constructor(private service:ResumeReviewService,private source:ResumeIdentity,private onConfirmed?:(receipt:ReviewReceipt)=>void, private pollIntervalMs=400, private validateDraft?:(result:ParsingResult,draft:ReviewDraft)=>Record<string,string>){}
  subscribe(listener:(state:ResumeReviewState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener);};}
  private update(value:Partial<ResumeReviewState>){if(!this.disposed){this.state={...this.state,...value};this.listeners.forEach(listener=>listener(this.state));}}
  private current(operation:AbortController){return !this.disposed&&this.active===operation&&!operation.signal.aborted;}
  async process(resumeJob=false){
    if(this.disposed||this.active||this.state.phase==="saving"||this.state.uncertain)return;
    const previous=resumeJob?this.state.job:null,operation=new AbortController();this.active=operation;
    this.update({...initialReviewState(),phase:"processing",checking:true,job:previous,message:"Waiting for processing status. No changes have been saved."});
    try{
      let job=previous??await this.service.start(this.source,{signal:operation.signal});
      if(!isParsingJob(job))throw new ResumeReviewRejected("Invalid job");
      const expectedId=job.id,expectedRevision=job.profileRevision;
      for(let attempt=0;attempt<10;attempt++){
        if(!this.current(operation))return;
        if(!isParsingJob(job)||!sameResume(job.source,this.source)||job.id!==expectedId||job.profileRevision!==expectedRevision)throw new ResumeReviewConflict("Invalid/stale job");
        this.update({job});
        if(job.status==="failed")throw new ResumeReviewRejected("Processing failed");
        if(job.status==="ready")break;
        // Status requests are adapter-controlled; no fabricated percentage or confidence score.
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(timer);operation.signal.removeEventListener("abort",abort);reject(new DOMException("Aborted","AbortError"));};
          const timer=setTimeout(()=>{operation.signal.removeEventListener("abort",abort);resolve();},this.pollIntervalMs);operation.signal.addEventListener("abort",abort,{once:true});
          if(operation.signal.aborted)abort();
        });
        job=await this.service.status(job.id,{signal:operation.signal});
      }
      if(!this.current(operation))return;
      if(!isParsingJob(job)||!sameResume(job.source,this.source)||job.id!==expectedId||job.profileRevision!==expectedRevision)throw new ResumeReviewConflict("Invalid/stale job");
      this.update({job});
      if(job.status!=="ready"){if(job.status==="failed")throw new ResumeReviewRejected("Processing failed");this.update({message:"Processing is still running. Check its status again or cancel this review."});return;}
      const result=await this.service.result(job.id,{signal:operation.signal});
      if(!this.current(operation))return;
      if(!isParsingResult(result))throw new ResumeReviewRejected("Missing or invalid result");
      if(result.jobId!==job.id||!sameResume(result.source,this.source)||result.snapshot.profileRevision!==job.profileRevision)throw new ResumeReviewConflict("Stale result");
      this.update({phase:"review",result,draft:selectProposals(result),errors:{},message:"Everything found in your CV is selected. Untick or fix anything wrong, then confirm. Nothing is saved until you confirm."});
    }catch(cause){if(this.current(operation))this.update({errors:{processing:cause instanceof ResumeReviewConflict?"The resume or profile changed, or the result is inconsistent. Load the current resume and start a fresh review.":"Processing or its result could not be loaded. Retry processing; your saved profile is unchanged."},stale:cause instanceof ResumeReviewConflict,message:"No review changes have been confirmed."});}
    finally{if(this.active===operation){this.active=null;this.update({checking:false});}}
  }
  edit(change:(draft:ReviewDraft)=>void){if(this.disposed||this.active||this.state.phase!=="review"||!this.state.draft)return;const draft=structuredClone(this.state.draft);change(draft);this.update({draft,errors:{},changes:null});}
  prepare(){if(this.active||!this.state.result||!this.state.draft||this.state.phase!=="review")return;const built=buildReviewChanges(this.state.result,this.state.draft,crypto.randomUUID());const errors={...(this.validateDraft?.(this.state.result,this.state.draft)??{}),...built.errors};this.update({errors,...(built.changes&&!Object.keys(errors).length?{phase:"confirm" as const,changes:built.changes,message:"Check the selected change set before confirming. Nothing has been saved."}:{})});}
  back(){if(!this.active&&this.state.phase==="confirm"&&!this.state.uncertain&&!this.state.stale)this.update({phase:"review",changes:null,errors:{}});}
  async confirm(){
    const changes=this.state.changes;
    if(this.disposed||this.active||this.state.phase!=="confirm"||!changes||this.state.stale)return;
    const operation=new AbortController();this.active=operation;this.update({phase:"saving",errors:{},message:"Confirming only the selected changes..."});
    try{
      const receipt=await this.service.confirm(structuredClone(changes),{signal:operation.signal});if(!this.current(operation))return;
      if(!receipt||receipt.requestId!==changes.requestId||receipt.jobId!==changes.jobId||!receipt.source||!sameResume(receipt.source,changes.source)||!isReviewSnapshot(receipt.snapshot)||receipt.snapshot.profileRevision===changes.profileRevision)throw new Error("Unconfirmed response");
      this.update({phase:"success",receipt,draft:null,changes:null,uncertain:false,message:"Selected changes were confirmed. Manual profile editing remains available."});
      try{this.onConfirmed?.(receipt);}catch{this.update({message:"Changes were confirmed. Refresh your Profile before continuing manual edits."});}
    }catch(cause){if(this.current(operation))this.update({phase:"confirm",stale:cause instanceof ResumeReviewConflict,uncertain:!(cause instanceof ResumeReviewConflict)&&!(cause instanceof ResumeReviewRejected),errors:{confirmation:cause instanceof ResumeReviewConflict?"The profile, resume or an entry changed. Your review draft is retained. Discard it and reload current data before confirming again.":cause instanceof ResumeReviewRejected?"Confirmation was rejected before saving. Review your selections or retry the same confirmation.":"Confirmation could not be verified. Retry this exact confirmation before editing selections; it may already have been accepted."},message:"No confirmation success has been received."});}
    finally{if(this.active===operation)this.active=null;}
  }
  cancel(){if(this.disposed||this.state.phase==="saving")return;this.active?.abort();this.active=null;this.update({...initialReviewState(),phase:"cancelled",message:this.state.uncertain?"Review draft discarded. This does not undo any server confirmation already accepted; reload Profile to check its state.":"Review draft discarded. Your saved profile was not changed by cancellation."});}
  dispose(){this.disposed=true;this.active?.abort();this.active=null;this.listeners.clear();}
}
