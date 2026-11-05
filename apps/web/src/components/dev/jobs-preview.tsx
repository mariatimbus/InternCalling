"use client";

import { useRef, useState } from "react";
import { TopTabs } from "@/components/ui/top-tabs";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { JobCard } from "@/components/jobs/job-card";
import { FilterBar, emptyJobFilters, type JobFilters } from "@/components/jobs/filter-bar";
import { DetailPanel, type JobDetail } from "@/components/jobs/detail-panel";
import { demoCountries, demoJobs } from "./demo-jobs";
import { useDemoWorkspace } from "./demo-workspace-provider";

type JobTab = "recommended" | "saved" | "applied";

/** Interactive fixture workspace. All product-like actions remain local to the demo. */
export function JobsPreview({ applicationsOnly = false, initialJobId }: { applicationsOnly?: boolean; initialJobId?: string }) {
  const requestedJob = demoJobs.find((job) => job.id === initialJobId);
  const { savedIds, appliedIds, toggleSaved, markApplied } = useDemoWorkspace();
  const [tab, setTab] = useState<JobTab>(applicationsOnly ? "applied" : "recommended");
  const [filters, setFilters] = useState<JobFilters>({ ...emptyJobFilters });
  const [selectedId, setSelectedId] = useState<string | null>(requestedJob?.id ?? demoJobs[0].id);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(requestedJob));
  const [detailOpen, setDetailOpen] = useState(Boolean(requestedJob));
  const [announcement, setAnnouncement] = useState("");
  const desktopHeading = useRef<HTMLDivElement>(null);
  const cardTrigger = useRef<HTMLButtonElement | null>(null);
  const list = demoJobs.filter((job) => {
    const query = filters.search.trim().toLowerCase();
    const matchesTab = tab === "recommended" || (tab === "saved" ? savedIds.includes(job.id) : appliedIds.includes(job.id));
    return matchesTab && (!filters.country || filters.country === job.country) && (!filters.workMode || filters.workMode === job.workMode)
      && (!query || [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase().includes(query));
  });
  const selected = list.find((job) => job.id === selectedId) ?? list[0] ?? null;
  const tabs = [
    { value: "recommended" as const, label: "Recommended", count: demoJobs.length },
    { value: "saved" as const, label: "Saved", count: savedIds.length },
    { value: "applied" as const, label: "Applied", count: appliedIds.length },
  ];
  const selectJob = (job: JobDetail) => {
    cardTrigger.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setSelectedId(job.id);
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDetailOpen(true);
      window.requestAnimationFrame(() => desktopHeading.current?.focus());
    }
    else setMobileDetailOpen(true);
  };
  const saveJob = (job: JobDetail) => {
    const wasSaved = savedIds.includes(job.id);
    toggleSaved(job.id);
    setAnnouncement(`${job.title} ${wasSaved ? "removed from" : "added to"} demo saved jobs.`);
  };
  const detailActions = (job: JobDetail) => <>
    <Button onClick={() => { markApplied(job.id); setAnnouncement(`${job.title} marked as applied in this demo. No application was sent.`); }} disabled={appliedIds.includes(job.id)}>{appliedIds.includes(job.id) ? "Applied in demo" : "Mark as applied (demo)"}</Button>
    <Button variant="secondary" aria-pressed={savedIds.includes(job.id)} onClick={() => saveJob(job)}>{savedIds.includes(job.id) ? "Saved" : "Save job"}</Button>
    <p className="w-full text-xs leading-relaxed text-muted/90">Demo action. No application is sent.</p>
  </>;
  return (
    <div className={`flex min-h-full flex-col ${detailOpen ? "lg:h-full lg:min-h-0" : ""}`}>
      <div className="shrink-0 px-4 pt-6 lg:px-7 lg:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-normal tracking-tight sm:text-3xl">{applicationsOnly ? "Your applications" : "Find your next internship"}</h1>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">{applicationsOnly ? "Keep the roles you have applied to in view." : "Tech roles across Europe, with the details that matter."}</p></div>
          <div role="group" aria-label="Results layout" className="hidden items-center rounded-full bg-surface/70 p-1 lg:flex">
            <Button id="card-view-control" variant="ghost" aria-pressed={!detailOpen} className="aria-pressed:bg-elevated aria-pressed:text-foreground" onClick={() => setDetailOpen(false)}><Icon name="grid" className="size-4" />Card view</Button>
            <Button variant="ghost" aria-pressed={detailOpen} className="aria-pressed:bg-elevated aria-pressed:text-foreground" onClick={() => setDetailOpen(true)}><Icon name="columns" className="size-4" />Split view</Button>
          </div>
        </div>
        {!applicationsOnly && <div className="max-w-lg"><TopTabs id="job-tab" panelId="job-results" label="Job lists" tabs={tabs} value={tab} onChange={(value) => { setTab(value); setMobileDetailOpen(false); }} /></div>}
      </div>
      <div className="shrink-0"><FilterBar value={filters} onChange={(value) => { setFilters(value); setMobileDetailOpen(false); }} countries={demoCountries} /></div>
      <div id="job-results" role={applicationsOnly ? "region" : "tabpanel"} aria-labelledby={applicationsOnly ? undefined : `job-tab-${tab}`} aria-label={applicationsOnly ? "Applied internships" : undefined} tabIndex={0} className={`min-h-0 flex-1 gap-5 px-0 lg:grid lg:px-3 lg:pb-3 ${detailOpen ? "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]" : "lg:grid-cols-1"}`}>
        <section aria-label="Internship results" className={`min-h-0 p-4 lg:px-4 ${detailOpen ? "lg:overflow-y-auto lg:overscroll-contain" : ""}`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><p role="status">{list.length} {list.length === 1 ? "internship" : "internships"}</p><span>Demo results</span></div>
          {list.length ? <ul className={`grid items-stretch gap-5 ${detailOpen ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>{list.map((job) => <li key={job.id}><JobCard job={job} density={detailOpen ? "compact" : "comfortable"} selected={detailOpen && selected?.id === job.id} saved={savedIds.includes(job.id)} applied={appliedIds.includes(job.id)} onSelect={() => selectJob(job)} onToggleSave={() => saveJob(job)} /></li>)}</ul> : <EmptyState title={tab === "saved" ? "No saved internships here" : "No internships found"} description="Try another search, clear your filters or explore the Recommended tab." action={<Button variant="secondary" onClick={() => { setFilters({ ...emptyJobFilters }); if (!applicationsOnly) setTab("recommended"); }}>Reset view</Button>} />}
        </section>
        <section aria-label="Selected internship" className={`hidden min-h-0 overflow-y-auto overscroll-contain rounded-panel bg-surface/70 p-5 ${detailOpen ? "lg:block" : ""}`}>
          <Button variant="ghost" className="mb-3" onClick={() => { setDetailOpen(false); window.requestAnimationFrame(() => { if (cardTrigger.current?.isConnected) cardTrigger.current.focus(); else document.getElementById("card-view-control")?.focus(); }); }}><Icon name="arrow" className="size-4 rotate-180" />Back to cards</Button>
          <div ref={desktopHeading} tabIndex={-1} className="rounded-control">
            {selected ? <DetailPanel job={selected} actions={detailActions(selected)} /> : <EmptyState title="Your next opportunity starts here" description="Choose an internship from the results to see the details." />}
          </div>
        </section>
      </div>
      <span role="status" className="sr-only">{announcement}</span>
      <Drawer open={mobileDetailOpen && Boolean(selected)} onClose={() => setMobileDetailOpen(false)} title="Internship details" size="detail" closeAt="(min-width: 1024px)">
        {selected && <DetailPanel job={selected} actions={detailActions(selected)} />}
      </Drawer>
    </div>
  );
}
