import { createResumePdfPreviewService } from "./resume-pdf-preview-service";
import { createResumeReviewPreviewService } from "./resume-review-preview-service";
import { applyReviewChanges, isParsingResult, ResumeReviewConflict, ResumeReviewRejected, type ReviewSnapshot } from "./resume-review";
import { validateOnboarding, onboardingPayload } from "./onboarding";
import { cvDemoProposals, type CvDemoScenario } from "./cv-onboarding-scenarios";
import { cvConfirmationErrors, type CvOnboardingServices } from "./cv-onboarding";
export function emptyCvSnapshot():ReviewSnapshot{return {profileRevision:"synthetic-first-profile",profile:{headline:"",bio:"",degree_level:"",study_year:"",university:"",field_of_study:"",graduation_year:"",location:""},skills:[],collections:{experience:[],projects:[],certificates:[],honours:[],languages:[],publications:[]}};}
/** No real profile/skills/upload/parser endpoints. Synthetic extraction is independent of file contents. */
export function createCvOnboardingPreviewServices(options:{delayMs?:number;scenario?:CvDemoScenario}={}){
  const pdf=createResumePdfPreviewService(options),review=createResumeReviewPreviewService({...options,initialSnapshot:emptyCvSnapshot()});
  const scenario=options.scenario??"complete";let retired=false,manualFailure=false;
  const live=()=>{if(retired)throw new ResumeReviewConflict("This demonstration session has ended");};const manualReceipts=new Map<string,{payload:string;snapshot:ReviewSnapshot}>();
  const services:CvOnboardingServices={capabilities:{upload:true,parsing:true,confirmation:true},pdf:{
    async load(options){live();const value=await pdf.load(options);live();return value;},async access(identity,options){live();const value=await pdf.access(identity,options);if(retired){if(value.kind==="local-preview")value.release();live();}return value;},
    async upload(file,options){live();const saved=await pdf.upload(file,options);if(retired){pdf.dispose();live();}review.setSource(saved);return saved;},
    async remove(identity,options){live();await pdf.remove(identity,options);live();review.setSource({id:"no-resume",revision:identity.revision+1});},
  },review:{
    async start(source,options){live();const saved=await pdf.load(options);live();if(!saved||saved.id!==source.id||saved.revision!==source.revision)throw new ResumeReviewConflict("Stale resume");const job=await review.start(source,options);live();return job;},
    async status(id,options){live();const job=await review.status(id,options);live();return job;},
    async result(id,options){live();const result=await review.result(id,options);live();if(isParsingResult(result)){const sample=cvDemoProposals(scenario);result.proposed=sample.proposed;result.warnings=sample.warnings;}return result;},
    async confirm(changes,options){live();const saved=await pdf.load(options);live();if(!saved||saved.id!==changes.source.id||saved.revision!==changes.source.revision)throw new ResumeReviewConflict("Stale resume");if(Object.keys(cvConfirmationErrors(review.snapshot(),changes)).length)throw new ResumeReviewRejected("Required details missing");const receipt=await review.confirm(changes,options);live();return receipt;},
  },manual:{
    async load({signal}){live();signal.throwIfAborted();return review.snapshot();},
    async confirm(draft,{profileRevision,requestId,signal}){
      live();signal.throwIfAborted();if(Object.keys(validateOnboarding(draft)).length)throw new ResumeReviewRejected("Required details missing");
      const payload=JSON.stringify({draft,profileRevision}),prior=manualReceipts.get(requestId);if(prior){if(prior.payload!==payload)throw new ResumeReviewRejected("Different request");return structuredClone(prior.snapshot);}
      if(manualFailure){manualFailure=false;throw new ResumeReviewRejected("Simulated manual failure");}
      const snapshot=review.snapshot();if(snapshot.profileRevision!==profileRevision)throw new ResumeReviewConflict("Stale manual profile");
      const next=applyReviewChanges(snapshot,{requestId,jobId:"manual",source:{id:"manual",revision:1},profileRevision,profile:onboardingPayload(draft),skills:{add:draft.skills},collections:[]});
      next.skills=[...new Set(draft.skills.map(name=>name.trim().toLowerCase()))];review.replaceSnapshot(profileRevision,next);manualReceipts.set(requestId,{payload,snapshot:structuredClone(next)});return structuredClone(next);
    },
  }};
  return {services,controls:{failUpload(){pdf.failNext("upload");},failProcessing(){review.failNext("processing");},failConfirmation(){review.failNext("save");},lostConfirmation(){review.failNext("uncertain");},staleProfile(){review.changeProfile();},staleResume(){const saved=pdf.changeRevision();if(saved)review.setSource(saved);else review.changeResume();},failManual(){manualFailure=true;}},snapshot:()=>review.snapshot(),isActive:()=>!retired,dispose(){retired=true;pdf.dispose();}};
}
