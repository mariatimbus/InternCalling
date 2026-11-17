"use client";
import { useCallback, useEffect, useState } from "react";
import { CvOnboardingFlow } from "@/components/onboarding/cv-onboarding-flow";
import { CvOnboardingDemoSession } from "@/lib/cv-onboarding-demo-session";
import { cvDemoScenarioLabels, type CvDemoScenario } from "@/lib/cv-onboarding-scenarios";
import type { CvOnboardingState } from "@/lib/cv-onboarding-controller";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
function DemoNotice({sticky=false}:{sticky?:boolean}){return <aside role="note" aria-label="Demo mode" className={(sticky?"sticky top-0 z-40 ":"")+"rounded-card border-2 border-accent bg-card p-4 text-sm font-semibold leading-6 text-foreground"}>{"Demo mode \u2014 your PDF is not analyzed. The information below is sample data."}</aside>;}
export function OnboardingPreview(){
  const [owner]=useState(()=>new CvOnboardingDemoSession()),[session,setSession]=useState(owner.state),[notice,setNotice]=useState("");
  useEffect(()=>owner.subscribe(setSession),[owner]);
  const observe=useCallback((state:CvOnboardingState)=>{if(session.demo.isActive())owner.observe(state);},[owner,session.demo]);
  const cancel=useCallback(()=>owner.cancel(),[owner]);
  const demo=session.demo;
  return <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 [&_h1]:scroll-mt-40 [&_h2]:scroll-mt-40">
    <DemoNotice sticky/>
    <h1 className="mt-6 text-2xl">CV-first onboarding development preview</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Fictional samples are independent of your file. Confirmation changes demo memory only. Refresh resets all state; no real account or workspace access changes.</p>
    <section aria-label="Development preview controls" className="mt-5 rounded-card border border-border p-4">
      <fieldset><legend className="text-sm font-semibold">Synthetic scenario</legend><div className="mt-3 flex flex-wrap gap-4">{(["complete","incomplete"] as const).map(scenario=><label key={scenario} className="flex min-h-11 items-center gap-3 rounded-control px-2 text-sm"><input type="radio" name="demo-scenario" value={scenario} checked={session.scenario===scenario} onChange={()=>{owner.request(scenario as CvDemoScenario);setNotice("");}}/>{cvDemoScenarioLabels[scenario]}</label>)}</div></fieldset>
      <p className="mt-2 text-xs leading-6 text-muted">{session.scenario==="complete"?"Valid fictional examples for every profile field, skills and all six optional sections. Nothing is accepted automatically.":"Several required values and optional details are unknown. No supplied proposal does not mean the CV section is empty; complete missing required values yourself."}</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={()=>{demo.controls.failUpload();setNotice("The next simulated upload will fail.");}}>Fail upload</Button><Button variant="secondary" onClick={()=>{demo.controls.failProcessing();setNotice("The next simulated processing job will fail.");}}>Fail processing</Button><Button variant="secondary" onClick={()=>{demo.controls.failConfirmation();setNotice("The next demo confirmation will fail before updating demo memory.");}}>Fail confirmation</Button><Button variant="secondary" onClick={()=>{demo.controls.lostConfirmation();setNotice("The next demo response will be lost; retry the exact confirmation.");}}>Lose confirmation response</Button><Button variant="secondary" onClick={()=>{demo.controls.staleProfile();setNotice("Sample profile data changed; an existing review will conflict.");}}>Change profile data</Button><Button variant="secondary" onClick={()=>{demo.controls.staleResume();setNotice("Sample resume data changed; existing proposals are stale.");}}>Change resume data</Button><Button variant="secondary" onClick={()=>{demo.controls.failManual();setNotice("The next demo manual confirmation will fail.");}}>Fail manual confirmation</Button></div>
      {notice&&<p role="status" className="mt-3 text-sm text-muted">{notice}</p>}
    </section>
    <CvOnboardingFlow key={session.epoch} services={demo.services} preview onStateChange={observe}/>
    <Drawer open={!!session.pending} onClose={cancel} title="Switch sample scenario?" description="This starts a fresh demonstration." footer={<div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={cancel}>Cancel switch</Button><Button onClick={()=>{owner.confirm();setNotice("Started a fresh "+cvDemoScenarioLabels[owner.state.scenario]+" demonstration.");}}>Switch scenario and discard demo</Button></div>}>
      <DemoNotice/><p className="mt-4 text-sm leading-6">Switching to {session.pending?cvDemoScenarioLabels[session.pending]:"another scenario"} discards the current demo file, edited proposals and temporary confirmations. Cancel keeps the current scenario and every draft.</p>
    </Drawer>
  </main>;
}
