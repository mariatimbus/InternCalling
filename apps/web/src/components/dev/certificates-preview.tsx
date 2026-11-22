"use client";
import { useState } from "react";
import { CertificatesSection } from "@/components/profile/certificates-section";
import { createCertificatesPreviewService } from "@/lib/certificates-preview-service";
import { Button } from "@/components/ui/button";
export function CertificatesPreview() {
  const [service] = useState(createCertificatesPreviewService);
  const [notice, setNotice] = useState("");
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-8"><h1 className="text-2xl">Certificates development preview</h1><p className="mt-3 text-sm leading-6 text-muted">In-memory preview only. No real account data is loaded or saved. Reload clears every entry.</p><Button className="mt-4" variant="secondary" onClick={() => { service.failNext(); setNotice("The next load or write will fail for testing."); }}>Simulate next failure</Button>{notice && <p role="status" className="mt-2 text-xs text-muted">{notice}</p>}<CertificatesSection service={service} /></main>;
}
