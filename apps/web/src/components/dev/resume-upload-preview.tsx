"use client";
import { useState } from "react";
import { ResumePdfSection } from "@/components/profile/resume-pdf-section";
import { createResumePdfPreviewService } from "@/lib/resume-pdf-preview-service";
import { Button } from "@/components/ui/button";
export function ResumeUploadPreview() {
  const [service] = useState(createResumePdfPreviewService), [notice, setNotice] = useState("");
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-8"><h1 className="text-2xl">Resume PDF development preview</h1><p className="mt-3 text-sm leading-6 text-muted">Simulated memory-only service. No file is sent to a server. Reload clears the file and metadata. Local preview links are not persisted or signed.</p><div className="mt-4 flex flex-wrap gap-3">{(["upload", "remove", "load", "access"] as const).map(kind => <Button key={kind} variant="secondary" onClick={() => { service.failNext(kind); setNotice("The next " + kind + " request will fail once."); }}>Fail next {kind === "upload" ? "upload / replacement" : kind}</Button>)}<Button variant="secondary" onClick={() => { service.conflictNext(); setNotice("The next upload or removal will report a revision conflict."); }}>Simulate conflict</Button></div>{notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}<ResumePdfSection service={service} preview /></main>;
}
