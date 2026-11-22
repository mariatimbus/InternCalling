"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OnboardingFlow } from "./onboarding-flow";
import { readOnboardingForm, validateOnboarding } from "@/lib/onboarding";
import { onboardingFromSnapshot, isConfirmedOnboardingComplete, type CvOnboardingServices } from "@/lib/cv-onboarding";
import { isReviewSnapshot, ResumeReviewConflict, type ReviewSnapshot } from "@/lib/resume-review";
import type { ActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
export function CvManualPreview({service,onConfirmed,onPending,demo=false}:{service:CvOnboardingServices["manual"];onConfirmed:(snapshot:ReviewSnapshot)=>void;onPending:(pending:boolean)=>void;demo?:boolean}){
  const [snapshot,setSnapshot]=useState<ReviewSnapshot|null>(null),[error,setError]=useState("");
  const lifecycle=useRef<AbortController|null>(null),busy=useRef(false),attempt=useRef<{payload:string;requestId:string}|null>(null);
  useEffect(()=>{const operation=new AbortController();lifecycle.current=operation;service.load({signal:operation.signal}).then(value=>{if(operation.signal.aborted)return;if(!isReviewSnapshot(value))throw new Error("Invalid baseline");setSnapshot(value);}).catch(()=>{if(!operation.signal.aborted)setError("Your saved details could not be loaded. Return to the introduction and discard this setup draft to retry.");});return()=>{operation.abort();if(lifecycle.current===operation)lifecycle.current=null;};},[service]);
  const action=useCallback(async(_previous:ActionState,form:FormData):Promise<ActionState>=>{
    if(busy.current)return {error:"Your confirmation is already in progress."};
    if(!snapshot||!lifecycle.current)return {error:"Load your saved details before confirming."};
    const draft=readOnboardingForm(form);if(!draft)return {error:"Review your answers and retry."};const fields=validateOnboarding(draft);if(Object.keys(fields).length)return {error:"Complete the required answers before confirming.",fields};
    const payload=JSON.stringify(draft);if(!attempt.current||attempt.current.payload!==payload)attempt.current={payload,requestId:crypto.randomUUID()};
    const operation=lifecycle.current;busy.current=true;onPending(true);
    try{const saved=await service.confirm(draft,{profileRevision:snapshot.profileRevision,requestId:attempt.current.requestId,signal:operation.signal});if(operation.signal.aborted)return {};if(!isReviewSnapshot(saved)||!isConfirmedOnboardingComplete(saved))throw new Error("Incomplete confirmation");onConfirmed(saved);return {success:demo?"Sample profile confirmed in demo memory only.":"Profile confirmed."};}
    catch(cause){return {error:cause instanceof ResumeReviewConflict?"Your saved details changed. Your answers are kept. Return to the introduction and discard this setup draft to load the latest details.":"Your profile could not be confirmed. Your answers are kept; try confirming again."};}
    finally{busy.current=false;if(!operation.signal.aborted)onPending(false);}
  },[service,snapshot,onConfirmed,onPending,demo]);
  if(error)return <div role="alert" className="mx-auto max-w-2xl px-5 py-8"><p className="text-sm">{error}</p><Button variant="secondary" onClick={()=>{const operation=lifecycle.current;if(!operation)return;setError("");void service.load({signal:operation.signal}).then(value=>{if(!operation.signal.aborted&&isReviewSnapshot(value))setSnapshot(value);else if(!operation.signal.aborted)setError("Saved details are still unavailable. Retry loading.");}).catch(()=>{if(!operation.signal.aborted)setError("Saved details could not be loaded. Retry loading.");});}}>Retry saved details</Button></div>;
  if(!snapshot)return <p role="status" className="mx-auto max-w-2xl px-5 py-8 text-sm">Loading your saved details...</p>;
  return <OnboardingFlow demo={demo} initial={onboardingFromSnapshot(snapshot.profile,snapshot.skills)} suggestions={[]} submitAction={action}/>;
}
