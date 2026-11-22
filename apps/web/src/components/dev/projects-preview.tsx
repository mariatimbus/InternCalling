"use client";
import { useState } from "react";
import { ProjectsSection } from "@/components/profile/projects-section";
import { createProjectsPreviewService } from "@/lib/projects-preview-service";
import { Button } from "@/components/ui/button";
export function ProjectsPreview() {
  const [service] = useState(createProjectsPreviewService);
  const [notice, setNotice] = useState("");
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-8"><h1 className="text-2xl">Projects development preview</h1><p className="mt-3 text-sm leading-6 text-muted">In-memory preview only. No real account data is loaded or saved. Reload clears every entry.</p><Button className="mt-4" variant="secondary" onClick={() => { service.failNext(); setNotice("The next load or write will fail for testing."); }}>Simulate next failure</Button>{notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}<ProjectsSection service={service} /></main>;
}
