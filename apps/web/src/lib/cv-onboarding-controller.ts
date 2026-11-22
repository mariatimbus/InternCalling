import { initialResumePdfState, type ResumePdfState } from "./resume-pdf-controller";
import { isReviewSnapshot, sameResume, type ReviewReceipt, type ReviewSnapshot } from "./resume-review";
import type { ResumeReviewState } from "./resume-review-controller";
import type { ResumeIdentity } from "./resume-pdf";
import { isConfirmedOnboardingComplete } from "./cv-onboarding";
export type CvOnboardingState={step:"intro"|"pdf"|"review"|"manual"|"complete";pdf:ResumePdfState;review:ResumeReviewState|null;source:ResumeIdentity|null;reviewEpoch:number;setupEpoch:number;invalidReview:boolean;discard:"review"|"all"|null;manualPending:boolean;confirmed:ReviewSnapshot|null;message:string};
export const initialCvOnboardingState=(connected=false):CvOnboardingState=>({step:"intro",pdf:initialResumePdfState(connected),review:null,source:null,reviewEpoch:0,setupEpoch:0,invalidReview:false,discard:null,manualPending:false,confirmed:null,message:""});
export class CvOnboardingController{
  state:CvOnboardingState;private listeners=new Set<(state:CvOnboardingState)=>void>();private disposed=false;
  constructor(private capabilities:{upload:boolean;parsing:boolean;confirmation:boolean}){this.state=initialCvOnboardingState(capabilities.upload);}
  subscribe(listener:(state:CvOnboardingState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener);};}
  private update(value:Partial<CvOnboardingState>){if(!this.disposed){this.state={...this.state,...value};this.listeners.forEach(listener=>listener(this.state));}}
  get busy(){return !!this.state.pdf.busy||this.state.review?.phase==="saving"||this.state.manualPending;}
  observePdf(pdf:ResumePdfState){const invalid=!!this.state.source&&(!pdf.confirmed||!sameResume(this.state.source,pdf.confirmed)||!!pdf.selected);this.update({pdf,invalidReview:this.state.invalidReview||invalid});}
  observeReview(review:ResumeReviewState){if(review.phase==="cancelled"){this.update({review:null,source:null,reviewEpoch:this.state.reviewEpoch+1,invalidReview:false,step:"pdf",message:"CV review draft discarded. You can choose another CV or complete manually."});}else this.update({review});}
  manualPending(pending:boolean){this.update({manualPending:pending});}
  go(step:CvOnboardingState["step"]){
    if(this.disposed||this.busy||this.state.discard)return;
    if(step==="complete")return;
    if(step==="review"){
      const pdf=this.state.pdf;
      if(!this.capabilities.upload||!this.capabilities.parsing||!this.capabilities.confirmation||pdf.status!=="ready"||!pdf.confirmed||pdf.selected||this.state.invalidReview){this.update({message:"Upload the selected CV successfully before reviewing it, or complete manually instead."});return;}
      this.update({step,source:this.state.source??{id:pdf.confirmed.id,revision:pdf.confirmed.revision},message:""});
    }else this.update({step,message:""});
  }
  askDiscard(kind:"review"|"all"){if(!this.busy)this.update({discard:kind});}
  keepDraft(){this.update({discard:null});}
  discardDraft(){
    if(this.busy||!this.state.discard)return;
    const all=this.state.discard==="all";
    this.update({source:null,review:null,invalidReview:false,reviewEpoch:this.state.reviewEpoch+1,setupEpoch:this.state.setupEpoch+(all?1:0),discard:null,step:all?"intro":"pdf",confirmed:null,message:"Unsaved setup drafts discarded. Any already confirmed upload or profile is kept."});
  }
  reviewConfirmed(receipt:ReviewReceipt){
    if(this.state.step!=="review")return;
    if(!this.state.source||this.state.invalidReview||!this.state.pdf.confirmed||!sameResume(this.state.source,this.state.pdf.confirmed)||!sameResume(this.state.source,receipt.source)){this.update({message:"The CV changed. Review the current CV before completing setup."});return;}
    this.complete(receipt.snapshot);
  }
  manualConfirmed(snapshot:ReviewSnapshot){if(this.state.step==="manual")this.complete(snapshot);}
  private complete(snapshot:ReviewSnapshot){if(!isReviewSnapshot(snapshot)||!isConfirmedOnboardingComplete(snapshot)){this.update({message:"Your saved details are still incomplete. Complete the required details manually before continuing."});return;}this.update({step:"complete",confirmed:structuredClone(snapshot),message:"Your confirmed profile is ready. You can keep editing it in Profile."});}
  dispose(){this.disposed=true;this.listeners.clear();}
}
