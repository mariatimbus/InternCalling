"use client";
import { ApplicationControls } from "@/components/applications/application-controls";
import type { Application } from "@/lib/api/types";
import { useState, useSyncExternalStore } from "react";
import type { Opportunity, Match, Eligibility } from "@/lib/api/types";
import { JobCard, type JobSummary } from "@/components/jobs/job-card";
import { MatchScore } from "@/components/jobs/match-score";
import { EligibilityBadge } from "@/components/jobs/eligibility-badge";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { opportunitySummary } from "@/lib/opportunities";

export type RankedOpportunity = { opportunity: Opportunity; match: Match | null; eligibility?: Eligibility };
function summary({ opportunity: job, match }: RankedOpportunity): JobSummary {
  return { ...opportunitySummary(job), matchScore: match?.score ?? null, eligibility: match?.eligibility ?? "unknown" };
}
function safeExternalUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function Brief({ item, application }: { item: RankedOpportunity; application?: Application }) {
  const { opportunity: job, match } = item;
  const url = safeExternalUrl(job.url);
  return <article className="space-y-7 p-2 sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted">{job.organization || "Organization not specified"}</p><h2 className="mt-3 text-2xl leading-snug tracking-tight">{job.title}</h2><p className="mt-3 text-sm text-muted">{job.location || "Location not specified"}</p></div><MatchScore score={match?.score ?? null} /></div>
    <div><EligibilityBadge status={match?.eligibility ?? "unknown"} /></div>
    {url && <div><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm text-on-primary hover:bg-primary-hover">View original opportunity<span className="sr-only"> (opens in a new tab)</span></a></div>}
    <ApplicationControls key={`${job.id}:${application?.updated_at ?? "new"}`} opportunityId={job.id} application={application} />
    <section><h3 className="text-sm font-medium">About the opportunity</h3><p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-muted">{job.description || "No description provided. Check the original opportunity for details."}</p></section>
    {job.skills.length > 0 && <section><h3 className="mb-3 text-sm font-medium">Skills</h3><div className="flex flex-wrap gap-2">{job.skills.map((skill) => <Badge key={skill.id}>{skill.name}</Badge>)}</div></section>}
    <section><h3 className="text-sm font-medium">Your match</h3>{match ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">{match.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p className="mt-3 text-sm leading-6 text-muted">Your match is currently unavailable. You can still review the opportunity.</p>}</section>
    {match && <section><h3 className="text-sm font-medium">Score breakdown</h3><p className="mt-2 text-xs text-muted">Profile relevance, not an acceptance probability.</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{Object.entries(match.components).map(([name, points]) => <div key={name}><dt className="text-muted">{name.replaceAll("_", " ")}</dt><dd>{points} points</dd></div>)}</dl></section>}
    {item.eligibility && <section><h3 className="text-sm font-medium">Eligibility requirements</h3><p className="mt-2 text-xs text-muted">Unknown requirements need confirmation from the official source.</p><ul className="mt-3 space-y-3 text-sm text-muted">{item.eligibility.reasons.map((rule) => <li key={rule.rule}><EligibilityBadge status={rule.status} /><p className="mt-1">{rule.reason}</p></li>)}</ul></section>}
    {job.deadline && <p className="border-t border-line pt-5 text-xs text-muted">Deadline: {new Date(job.deadline).toLocaleDateString("en-GB", { timeZone: "UTC" })}</p>}
  </article>;
}
const subscribeHydration = () => () => {};

export function RecommendedJobs({ items, applications = [] }: { items: RankedOpportunity[]; applications?: Application[] }) {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [selected, setSelected] = useState(items[0]?.opportunity.id);
  const [open, setOpen] = useState(false);
  const current = items.find((item) => item.opportunity.id === selected) ?? items[0];
  if (!current) return <EmptyState title="No opportunities found" description="Try another search or come back later for new opportunities." />;
  return <><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"><div className="space-y-4" aria-label="Recommended opportunities">{items.map((item) => <JobCard key={item.opportunity.id} job={summary(item)} density="compact" disabled={!hydrated} selected={current.opportunity.id === item.opportunity.id} onSelect={() => { setSelected(item.opportunity.id); setOpen(true); }} />)}</div><div className="sticky top-6 hidden max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-panel bg-surface/60 p-4 xl:block" aria-label="Selected opportunity"><Brief item={current} application={applications.find((item) => item.opportunity_id === current.opportunity.id)} /></div></div><Drawer open={open} onClose={() => setOpen(false)} title="Opportunity details" size="detail" closeAt="(min-width: 1280px)"><Brief item={current} application={applications.find((item) => item.opportunity_id === current.opportunity.id)} /></Drawer></>;
}
