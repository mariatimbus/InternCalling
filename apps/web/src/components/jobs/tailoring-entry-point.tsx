"use client";
import { useMemo, useState } from "react";
import { createProfileServices } from "@/lib/profile-services";
import { ResumeTailoringFlow } from "@/components/profile/resume-tailoring-flow";
export function TailoringEntryPoint({jobId,title,organization}:{jobId?:string;title:string;organization:string}) {
  const services = useMemo(() => createProfileServices(), []);
  const [opened,setOpened] = useState(false);
  return <details className="rounded-panel border border-border p-4" onToggle={event => {if(event.currentTarget.open)setOpened(true);}}><summary className="cursor-pointer text-sm font-medium">Tailor resume for this job</summary><p className="mt-3 break-words text-sm">{title} · {organization || "Organization not specified"}</p>{opened && jobId ? <ResumeTailoringFlow jobId={jobId} service={services.tailoring}/> : !jobId ? <p role="status" className="mt-3 text-sm">Choose an opportunity to prepare your resume.</p> : null}</details>;
}
