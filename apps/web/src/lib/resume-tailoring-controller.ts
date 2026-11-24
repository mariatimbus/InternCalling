import { isTailoringContext,isTailoringDraft,isTailoringScope,sameTailoringScope,contextScope,sameTailoringRef,isTailoringRef,validateTailoringBlocks,approvalErrors,sourceWording,validTailoringDownload,TailoringConflict,TailoringRejected,type ResumeTailoringService,type TailoringContext,type TailoringDraft,type TailoringBlock,type TailoringApproval,type TailoringExport,type TailoringGeneration,type TailoringDownload } from "./resume-tailoring";
export type TailoringState={phase:"unavailable"|"loading"|"ready"|"generating"|"review";context:TailoringContext|null;draft:TailoringDraft|null;blocks:TailoringBlock[];dirty:boolean;approval:TailoringApproval|null;exportJob:TailoringExport|null;download:TailoringDownload|null;generation:TailoringGeneration|null;busy:"load"|"generate"|"save"|"approve"|"export"|"download"|null;uncertain:"save"|"approve"|"export"|null;stale:boolean;abandon:"reload"|"generate"|"close"|null;error:string;notice:string};
export const initialTailoringState=(connected=false):TailoringState=>({phase:connected?"loading":"unavailable",context:null,draft:null,blocks:[],dirty:false,approval:null,exportJob:null,download:null,generation:null,busy:null,uncertain:null,stale:false,abandon:null,error:"",notice:""});
export class ResumeTailoringController{
  state:TailoringState;private listeners=new Set<(state:TailoringState)=>void>();private active:AbortController|null=null;private disposed=false;private expiry:ReturnType<typeof setTimeout>|null=null;private requests=new Map<string,{payload:string;requestId:string}>();
  constructor(private jobId:string,private service?:ResumeTailoringService,private preview=false,private pollMs=300){this.state=initialTailoringState(!!service);}
  subscribe(listener:(state:TailoringState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener);};}
  private update(value:Partial<TailoringState>){if(!this.disposed){this.state={...this.state,...value};this.listeners.forEach(listener=>listener(this.state));}}
  private current(operation:AbortController){return !this.disposed&&this.active===operation&&!operation.signal.aborted;}
  private request(kind:string,value:unknown){const payload=JSON.stringify(value),prior=this.requests.get(kind);if(prior?.payload===payload)return prior.requestId;const requestId=crypto.randomUUID();this.requests.set(kind,{payload,requestId});return requestId;}
  private releaseDownload(){if(this.expiry)clearTimeout(this.expiry);this.expiry=null;const access=this.state.download?.access;if(access&&access.kind!=="authorized")access.release();this.update({download:null});}
  private invalidate(){this.releaseDownload();this.requests.delete("approve");this.requests.delete("export");this.update({approval:null,exportJob:null});}
  private fail(cause:unknown,kind?:"save"|"approve"|"export"){
    if(cause instanceof TailoringConflict){this.invalidate();this.update({stale:true,uncertain:null,error:"The job, source or tailored draft changed. Your local edits are kept. Reload current data before continuing."});}
    else this.update({error:cause instanceof TailoringRejected?"The request was rejected before completion. Review the draft and retry.":kind?"The response could not be confirmed. Retry this exact request before editing; it may already have been accepted.":"This action could not be completed. Your current draft is kept. Retry or cancel.",uncertain:kind&&!(cause instanceof TailoringRejected)?kind:null});
  }
  private async pause(signal:AbortSignal){await new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException("Aborted","AbortError"));return;}const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(new DOMException("Aborted","AbortError"));};const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},this.pollMs);signal.addEventListener("abort",abort,{once:true});});}
  async load(){
    if(this.disposed||!this.service||this.active)return;const op=new AbortController();this.active=op;this.releaseDownload();this.update({...initialTailoringState(true),busy:"load"});
    try{const context=await this.service.load(this.jobId,{signal:op.signal});if(!this.current(op))return;if(!isTailoringContext(context)||context.job.id!==this.jobId)throw new Error("Invalid context");this.update({context,phase:"ready"});}
    catch(cause){if(this.current(op)){this.fail(cause);this.update({phase:"unavailable"});}}
    finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  requestAbandon(intent:"reload"|"generate"|"close"){
    if(this.active)return;if(this.state.draft||this.state.dirty||this.state.uncertain)this.update({abandon:intent});else if(intent==="reload")void this.load();else if(intent==="generate")void this.generate();
  }
  keepEditing(){this.update({abandon:null});}
  confirmAbandon(){if(this.active||!this.state.abandon)return;const intent=this.state.abandon;this.invalidate();this.requests.clear();this.update({draft:null,blocks:[],dirty:false,uncertain:null,abandon:null,generation:null,error:"",phase:this.state.context?"ready":"unavailable"});if(intent==="reload"||this.state.stale)void this.load();else if(intent==="generate")void this.generate();}
  async generate(resume=false){
    const context=this.state.context;if(this.disposed||!this.service||this.active||!context||this.state.uncertain||this.state.stale)return;const op=new AbortController();this.active=op;this.update({busy:"generate",phase:"generating",error:"",notice:""});
    try{let job=resume?this.state.generation:null;if(!job)job=await this.service.generate(contextScope(context),{requestId:this.request("generate",contextScope(context)),signal:op.signal});
      const id=job?.id;
      for(let i=0;i<10;i++){
        if(!this.current(op))return;
        if(!job||!isTailoringScope(job.scope)||!sameTailoringScope(job.scope,contextScope(context))||typeof job.id!=="string"||job.id!==id||!["queued","running","ready","failed"].includes(job.status))throw new TailoringConflict("Stale generation");
        this.update({generation:job});if(job.status==="failed")throw new TailoringRejected("Generation failed");if(job.status==="ready")break;await this.pause(op.signal);job=await this.service.generationStatus(id,{signal:op.signal});
      }
      if(!this.current(op))return;
      if(!job||!isTailoringScope(job.scope)||!sameTailoringScope(job.scope,contextScope(context))||job.id!==id)throw new TailoringConflict("Stale generation");
      this.update({generation:job});
      if(job.status==="failed")throw new TailoringRejected("Generation failed");
      if(job.status!=="ready"){this.update({notice:"Draft preparation is still running. Check status again."});return;}
      if(!isTailoringDraft(job.draft,context,true))throw new TailoringRejected("Invalid source references");
      this.invalidate();this.update({draft:structuredClone(job.draft),blocks:structuredClone(job.draft.blocks),phase:"review",dirty:false,notice:this.preview?"Synthetic proposed wording is ready. No AI generation occurred.":"Proposed wording is ready for your review."});
    }catch(cause){if(this.current(op)){if(cause instanceof TailoringRejected){this.requests.delete("generate");this.update({generation:null});}this.fail(cause);this.update({phase:this.state.draft?"review":"ready"});}}
    finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  edit(change:(blocks:TailoringBlock[])=>void){if(this.disposed||this.active||this.state.uncertain||this.state.stale||!this.state.draft)return;const blocks=structuredClone(this.state.blocks);change(blocks);this.invalidate();this.requests.delete("save");this.update({blocks,dirty:true,error:"",notice:"Local edits invalidate approval and previous download links. Save and approve this version again."});}
  wording(id:string,text:string){this.edit(blocks=>{const block=blocks.find(row=>row.id===id);if(block){block.text=text;block.wording="user";block.decision="pending";}});}
  accept(id:string){this.edit(blocks=>{const block=blocks.find(row=>row.id===id);if(block)block.decision="accepted";});}
  rejectWording(id:string){if(!this.state.context)return;const context=this.state.context;this.edit(blocks=>{const block=blocks.find(row=>row.id===id);if(block?.origin==="source"){block.text=sourceWording(block,context);block.wording="source";block.decision="accepted";}});}
  exclude(id:string){this.edit(blocks=>{const block=blocks.find(row=>row.id===id);if(block)block.decision="excluded";});}
  move(id:string,direction:-1|1){this.edit(blocks=>{const index=blocks.findIndex(row=>row.id===id),target=index+direction;if(index>=0&&target>=0&&target<blocks.length)[blocks[index],blocks[target]]=[blocks[target],blocks[index]];});}
  addUser(section:TailoringBlock["section"],title:string,text:string){this.edit(blocks=>{blocks.push({id:"user-"+crypto.randomUUID(),section,title,text,sourceRefs:[],origin:"user",wording:"user",decision:"pending"});});}
  async save(){
    const {draft,context,blocks}=this.state;if(this.disposed||!this.service||this.active||!draft||!context||!this.state.dirty||this.state.stale||this.state.uncertain&&this.state.uncertain!=="save")return;
    const errors=validateTailoringBlocks(blocks,context);if(Object.keys(errors).length){this.update({error:Object.values(errors).join(" ")});return;}
    const op=new AbortController();this.active=op;const payload={draft:{id:draft.id,revision:draft.revision},blocks:structuredClone(blocks)};this.update({busy:"save",error:""});
    try{const result=await this.service.save(payload.draft,payload.blocks,{signal:op.signal,requestId:this.request("save",payload)});if(!this.current(op))return;if(!isTailoringDraft(result,context)||result.id!==draft.id||result.revision===draft.revision)throw new Error("Unconfirmed saved version");const changed=JSON.stringify(result.blocks)!==JSON.stringify(payload.blocks);this.invalidate();this.update({draft:structuredClone(result),blocks:changed?result.blocks.map(block=>({...block,decision:block.decision==="excluded"?"excluded":"pending"})):structuredClone(result.blocks),dirty:changed,uncertain:null,notice:changed?"Saved wording changed during normalization. Review and accept the changed items before approval.":this.preview?"Tailored draft saved in demo memory only.":"Tailored draft saved. Your standard resume and Profile are unchanged."});}
    catch(cause){if(this.current(op))this.fail(cause,"save");}finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  async approve(){
    const {draft,context}=this.state;if(this.disposed||!this.service||this.active||!draft||!context||this.state.dirty||this.state.stale||this.state.uncertain&&this.state.uncertain!=="approve")return;
    const errors=approvalErrors(this.state.blocks);if(Object.keys(errors).length){this.update({error:Object.values(errors).join(" ")});return;}
    const op=new AbortController();this.active=op;this.update({busy:"approve",error:""});
    try{const approval=await this.service.approve({id:draft.id,revision:draft.revision},{signal:op.signal,requestId:this.request("approve",draft)});if(!this.current(op))return;if(!approval||typeof approval.id!=="string"||!isTailoringRef(approval.draft)||!sameTailoringRef(approval.draft,draft)||!isTailoringScope(approval.scope)||!sameTailoringScope(approval.scope,contextScope(context)))throw new Error("Unconfirmed approval");this.update({approval,uncertain:null,notice:this.preview?"This exact tailored revision is approved in demo memory only.":"This exact tailored revision is approved."});}
    catch(cause){if(this.current(op))this.fail(cause,"approve");}finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  private validExport(job:TailoringExport,approval:TailoringApproval){return job&&typeof job.id==="string"&&job.approvalId===approval.id&&isTailoringRef(job.draft)&&sameTailoringRef(job.draft,approval.draft)&&["queued","running","ready","failed"].includes(job.status);}
  async exportPdf(resume=false){
    const {draft,approval}=this.state;if(this.disposed||!this.service||this.active||!draft||!approval||this.state.dirty||this.state.stale||!sameTailoringRef(draft,approval.draft)||this.state.uncertain&&this.state.uncertain!=="export")return;
    const op=new AbortController();this.active=op;this.releaseDownload();this.update({busy:"export",error:""});
    try{let job=resume?this.state.exportJob:null;if(!job)job=await this.service.exportPdf(approval,{signal:op.signal,requestId:this.request("export",approval)});for(let i=0;i<10;i++){if(!this.current(op))return;if(!job||!this.validExport(job,approval))throw new TailoringConflict("Stale export");this.update({exportJob:job});if(job.status==="failed")throw new TailoringRejected("Export failed");if(job.status==="ready")break;await this.pause(op.signal);job=await this.service.exportStatus(job.id,{signal:op.signal});}if(!this.current(op))return;if(!job||!this.validExport(job,approval))throw new TailoringConflict("Stale export");if(job.status==="failed")throw new TailoringRejected("Export failed");this.update({exportJob:job,uncertain:null,notice:job.status==="ready"?this.preview?"Fixed sample PDF ready. It does not contain your edited draft.":"Approved-version PDF is ready.":"PDF preparation is still running. Check status again."});}
    catch(cause){if(this.current(op)){if(cause instanceof TailoringRejected){this.requests.delete("export");this.update({exportJob:null});}this.fail(cause,"export");}}finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  async download(){
    const {draft,approval,exportJob}=this.state;if(this.disposed||!this.service||this.active||!draft||!approval||!exportJob||exportJob.status!=="ready"||this.state.dirty||this.state.stale||this.state.uncertain||!sameTailoringRef(draft,exportJob.draft))return;
    const op=new AbortController();this.active=op;this.releaseDownload();this.update({busy:"download",error:""});
    try{const download=await this.service.download(exportJob.id,{signal:op.signal});if(!this.current(op)){if(download?.access&&download.access.kind!=="authorized")download.access.release();return;}if(!validTailoringDownload(download,exportJob,this.preview)){if(download?.access&&download.access.kind!=="authorized")download.access.release();throw new TailoringConflict("Invalid/stale download");}this.update({download});if(download.access.kind==="authorized")this.expiry=setTimeout(()=>{this.releaseDownload();this.update({notice:"The download link expired. Request a fresh link."});},Math.min(Date.parse(download.access.expiresAt)-Date.now(),2147483647));}
    catch(cause){if(this.current(op))this.fail(cause);}finally{if(this.active===op){this.active=null;this.update({busy:null});}}
  }
  cancel(){if(!this.active||!["generate","export","download"].includes(this.state.busy??""))return;this.active.abort();this.active=null;this.releaseDownload();this.update({busy:null,generation:null,exportJob:this.state.busy==="download"?this.state.exportJob:null,phase:this.state.draft?"review":"ready",notice:"Request stopped locally. No application was submitted. A server operation may already have completed."});}
  dispose(){this.active?.abort();this.active=null;this.releaseDownload();this.disposed=true;this.listeners.clear();}
}
