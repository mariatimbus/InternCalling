"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/page-heading";

/** Local-only profile example; no personal data is persisted or uploaded. */
export function ProfilePreview() {
  const [message, setMessage] = useState("");
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-7 sm:p-8 lg:p-10">
      <PageHeading title="Your profile" description="A place for your experience, skills and internship preferences." />
      <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="rounded-card border border-line bg-surface p-5">
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-accent/10 text-lg font-medium text-accent">DS</span>
          <h2 className="mt-4 text-base font-semibold">Demo student</h2>
          <p className="mt-1 text-sm text-muted">Student profile</p>
          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">Fictional profile for exploring the workspace. No account is connected.</p>
        </aside>
        <div className="space-y-6">
          <form onSubmit={(event) => { event.preventDefault(); setMessage("Demo profile updated for this view. Nothing was saved or sent."); }} className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-base font-semibold">Internship preferences</h2>
            <p className="mt-1.5 text-sm text-muted">The basics that help frame your search.</p>
            <div className="mt-6 space-y-5">
              <Input label="Display name" defaultValue="Demo student" required />
              <Input label="Interested in" defaultValue="Frontend engineering" />
              <Select label="Degree level" defaultValue="bachelor"><option value="bachelor">Bachelor&apos;s</option><option value="master">Master&apos;s</option></Select>
            </div>
            <div className="mt-6 border-t border-line pt-5"><Button type="submit">Update demo profile</Button><p role="status" className="mt-3 text-sm text-muted">{message}</p></div>
          </form>
          <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3"><Icon name="applications" className="mt-0.5 text-accent" /><div><h2 className="text-base font-semibold">Resume</h2><p className="mt-2 text-sm leading-relaxed text-muted">Your experience will live here. File uploads are unavailable in this preview.</p></div></div>
            <Button variant="secondary" disabled className="mt-5">Upload resume</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
