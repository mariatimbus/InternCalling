"use client";
import { useState } from "react";
import { PublicationsSection } from "@/components/profile/publications-section";
import { createPublicationsPreviewService } from "@/lib/publications-preview-service";
import { Button } from "@/components/ui/button";
export function PublicationsPreview() {
  const [service] = useState(createPublicationsPreviewService);
  const [notice, setNotice] = useState("");
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-8">
    <h1 className="text-2xl">Publications development preview</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Temporary in-memory preview only. No real account data is loaded or saved. Reload clears every entry.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => { service.failNext(); setNotice("The next load or write will fail for testing."); }}>Simulate next failure</Button><Button variant="secondary" onClick={() => { service.conflictNext(); setNotice("The next edit or delete will report a revision conflict. Create and load are unaffected."); }}>Simulate next edit/delete conflict</Button></div>
    {notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}
    <PublicationsSection service={service} />
  </main>;
}
