"use client";

import { useMemo, useState } from "react";
import { AtsPanel } from "@/components/jobs/ats-panel";
import { ResumeTailoringFlow } from "@/components/profile/resume-tailoring-flow";
import { createProfileServices } from "@/lib/profile-services";

export function TailoringEntryPoint({ jobId, title, organization, embedded = false }: {
  jobId?: string; title: string; organization: string; embedded?: boolean;
}) {
  const services = useMemo(() => createProfileServices(), []);
  const [opened, setOpened] = useState(false);
  const content = <>
    <p className="mt-3 break-words text-sm">{title} · {organization || "Organization not specified"}</p>
    {(embedded || opened) && jobId
      ? <div className="mt-3 space-y-6"><AtsPanel jobId={jobId} />
        <div className="border-t border-line pt-5"><h3 className="card-title">Review each item yourself</h3>
          <ResumeTailoringFlow jobId={jobId} service={services.tailoring} /></div></div>
      : !jobId && <p role="status" className="mt-3 text-sm">Choose an opportunity to prepare your resume.</p>}
  </>;
  return embedded ? content : <details className="rounded-panel border border-border p-4"
    onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="cursor-pointer text-sm font-medium">Tailor CV &amp; cover letter for this job</summary>
    {content}
  </details>;
}
