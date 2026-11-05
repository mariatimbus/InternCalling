"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MatchScore } from "@/components/jobs/match-score";
import { EligibilityBadge } from "@/components/jobs/eligibility-badge";

/** Isolated UI state gallery, unrelated to network or authentication. */
export function ComponentGallery() {
  const [open, setOpen] = useState(false);
  const [showError, setShowError] = useState(true);
  const [message, setMessage] = useState("");
  return <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:p-8">
    <header><h1 className="text-2xl font-semibold">Component gallery</h1><p className="mt-2 text-sm text-muted">Shared presentation components and keyboard interaction examples.</p></header>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Actions and labels</h2><div className="flex flex-wrap items-center gap-3"><Button onClick={() => setMessage("Primary action activated.")}>Primary</Button><Button variant="secondary" onClick={() => setMessage("Secondary action activated.")}>Secondary</Button><Button variant="ghost" size="sm" onClick={() => setMessage("Ghost action activated.")}>Ghost</Button><Button disabled>Disabled</Button><Badge>Neutral</Badge><Badge variant="accent">Accent</Badge></div><p role="status" className="text-sm text-muted">{message}</p></section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Fields</h2><div className="grid gap-4 sm:grid-cols-2"><Input label="Example search" type="search" hint="Use a visible label for every field." /><Select label="Example country"><option>All countries</option><option>Romania</option></Select><Input label="Example invalid field" error="Enter a job title to continue." defaultValue="" /><Input label="Unavailable field" disabled placeholder="Disabled" /></div></section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Match and eligibility</h2><div className="flex flex-wrap items-center gap-4"><MatchScore score={86} /><MatchScore score={null} /><EligibilityBadge status="eligible" /><EligibilityBadge status="review" /><EligibilityBadge status="unknown" /></div></section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Loading, empty and error states</h2><LoadingSkeleton count={1} label="Example loading state" /><EmptyState title="No results yet" description="A helpful explanation belongs here." />{showError ? <ErrorState title="Example connection problem" description="This is a simulated error, not a failed API request." action={<Button variant="secondary" onClick={() => setShowError(false)}>Retry example</Button>} /> : <Button variant="secondary" onClick={() => setShowError(true)}>Show example error</Button>}</section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Drawer</h2><Button variant="secondary" aria-expanded={open} aria-controls="example-drawer" onClick={() => setOpen(true)}>Open example drawer</Button><Drawer id="example-drawer" title="Example drawer" description="Check Tab, Shift+Tab, Escape and focus restoration." open={open} onClose={() => setOpen(false)}><Input label="Example field in drawer" /><Button className="mt-4" onClick={() => setOpen(false)}>Finish example</Button></Drawer></section>
  </div>;
}
