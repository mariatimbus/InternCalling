"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/page-heading";

/** Demonstrates account presentation without changing any real account settings. */
export function SettingsPreview() {
  const [compact, setCompact] = useState(false);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-7 sm:p-8 lg:p-10">
      <PageHeading title="Settings" description="Your workspace preferences and account details." />
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line px-6 py-5"><h2 className="text-base font-semibold">Display preferences</h2><p className="mt-1.5 text-sm text-muted">Preview how a compact layout feels.</p></div>
        <div className="p-6">
          <label className="flex min-h-11 cursor-pointer items-start justify-between gap-5"><span><span className="block text-sm font-medium">Compact display</span><span className="mt-1.5 block text-xs leading-relaxed text-muted">This example adjusts the space in the sample below.</span></span><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" /></label>
          <div className={`mt-5 rounded-control border border-line bg-background/40 text-sm text-muted ${compact ? "p-3" : "p-6"}`}>Your next internship, with room to focus.</div>
          <p className="mt-3 text-xs text-muted">Sample preference only. Resets when you leave this page.</p>
        </div>
      </section>
      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-base font-semibold">Account</h2><p className="mt-2 text-sm leading-relaxed text-muted">This demo workspace is not connected to an account. Account changes are unavailable.</p><Button variant="secondary" disabled className="mt-5">Account actions unavailable in demo</Button>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6"><div><h2 className="text-sm font-medium">Component gallery</h2><p className="mt-1.5 text-xs text-muted">Shared controls, loading, empty and error states.</p></div><Link href="/preview/components" className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-accent hover:text-foreground">Open component gallery<Icon name="chevron" className="size-4" /></Link></section>
    </div>
  );
}
