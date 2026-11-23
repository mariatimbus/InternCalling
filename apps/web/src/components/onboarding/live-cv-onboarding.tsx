"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createProfileServices, type WorkspaceCapabilities } from "@/lib/profile-services";
import { CvOnboardingFlow } from "./cv-onboarding-flow";
import type { OnboardingFlowProps } from "./onboarding-flow";
export function LiveCvOnboarding(props: {manualInitial: OnboardingFlowProps["initial"]; manualSuggestions: string[]}) {
  const router = useRouter(), adapters = useMemo(() => createProfileServices(), []);
  const [capabilities, setCapabilities] = useState<WorkspaceCapabilities | null>(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { const operation = new AbortController();
    void adapters.capabilities(operation.signal).then(value => { if (!operation.signal.aborted) { setCapabilities(value); setFailed(false); } }).catch(() => { if (!operation.signal.aborted) setFailed(true); });
    return () => operation.abort();
  }, [adapters, attempt]);
  const services = useMemo(() => capabilities ? {capabilities, pdf: adapters.pdf, review: adapters.review, manual: adapters.manual} : undefined, [adapters, capabilities]);
  if (!capabilities && !failed) return <p role="status" className="p-8">Checking CV services…</p>;
  if (!capabilities) return <><p role="status" className="px-6">CV services could not be checked. You can complete your profile manually.</p><button className="min-h-11 px-6 underline" onClick={() => {setFailed(false);setAttempt(value => value + 1);}}>Retry CV services</button><CvOnboardingFlow {...props}/></>;
  return <CvOnboardingFlow services={services} onContinue={() => {router.replace("/jobs");router.refresh();}}/>;
}
