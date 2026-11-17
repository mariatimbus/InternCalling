/** Development-only session ownership, separate from product onboarding state. */
import { createCvOnboardingPreviewServices } from "./cv-onboarding-preview-service";
import type { CvDemoScenario } from "./cv-onboarding-scenarios";
import type { CvOnboardingState } from "./cv-onboarding-controller";
export type CvDemoSessionState={scenario:CvDemoScenario;demo:ReturnType<typeof createCvOnboardingPreviewServices>;epoch:number;pending:CvDemoScenario|null;engaged:boolean};
export class CvOnboardingDemoSession{
  state:CvDemoSessionState;private listeners=new Set<(state:CvDemoSessionState)=>void>();
  constructor(private factory=createCvOnboardingPreviewServices){this.state={scenario:"complete",demo:factory({scenario:"complete"}),epoch:0,pending:null,engaged:false};}
  subscribe(listener:(state:CvDemoSessionState)=>void){this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener);};}
  private update(value:Partial<CvDemoSessionState>){this.state={...this.state,...value};this.listeners.forEach(listener=>listener(this.state));}
  observe(value:CvOnboardingState){if(!this.state.engaged&&(value.step!=="intro"||value.pdf.selected||value.pdf.confirmed||value.source))this.update({engaged:true});}
  request(scenario:CvDemoScenario){if(scenario===this.state.scenario)return;if(this.state.engaged)this.update({pending:scenario});else this.switch(scenario);}
  cancel(){this.update({pending:null});}
  confirm(){if(this.state.pending)this.switch(this.state.pending);}
  private switch(scenario:CvDemoScenario){this.state.demo.dispose();this.update({scenario,demo:this.factory({scenario}),epoch:this.state.epoch+1,pending:null,engaged:false});}
  dispose(){this.state.demo.dispose();this.listeners.clear();}
}
