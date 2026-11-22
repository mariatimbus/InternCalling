"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Application, Opportunity, Match } from "@/lib/api/types";
import type { SaveResult } from "@/app/(workspace)/jobs/save-action";
import { JobCard, type JobSummary } from "@/components/jobs/job-card";
import { MatchScore } from "@/components/jobs/match-score";
import { CompanyAvatar } from "@/components/jobs/company-avatar";
import { EligibilityBadge } from "@/components/jobs/eligibility-badge";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { opportunitySummary, opportunityTypeLabel } from "@/lib/opportunities";
import { TailoringEntryPoint } from "@/components/jobs/tailoring-entry-point";
import { degreeLabels, safeJobSource, studyYears } from "@/components/jobs/opportunity-details";

export type RankedOpportunity = {
  opportunity: Opportunity | Application["opportunity"];
  match: Match | null;
  status?: Application["status"];
  companyLogoUrl?: string | null;
};
function summary({ opportunity: job, match, companyLogoUrl }: RankedOpportunity): JobSummary {
  const card = opportunitySummary(job);
  return { ...card, initials: job.organization?.trim() ? card.initials : "–", companyLogoUrl,
    matchScore: match?.score ?? null, eligibility: match?.eligibility ?? "unknown" };
}
function cardDate(value: string | null | undefined) {
  if (!value) return;
  const timestamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(value) ? value + "Z" : value;
  const date = new Date(timestamp);
  if (Number.isFinite(date.getTime())) return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function cardMetadata(job: RankedOpportunity["opportunity"]) {
  const deadline = { label: "Deadline", value: cardDate(job.deadline) };
  const fields = [deadline];
  if ("url" in job) {
    fields.push(
      { label: "Posted", value: cardDate(job.posted_at) },
      { label: "Degree level", value: job.degree_level ? degreeLabels[job.degree_level] : undefined },
      { label: "Study year", value: studyYears(job.study_year) },
    );
  }
  return fields.filter((field): field is { label: string; value: string } => Boolean(field.value));
}

function briefDescription(listing: Opportunity, officialUrl: string | null) {
  const source = listing.description ?? "";
  const description = source.replace(/^[ \t]*Official source:[ \t]+(?:<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>]+))[ \t]*(?:\r?\n|$)/gmi,
    (line, bracketed, bare) => officialUrl && safeJobSource(bracketed ?? bare) === officialUrl ? "" : line);
  if (!description.trim()) return null;

  // A7 supplies plain text. Only literal, short values from the structured listing are eligible.
  const phrases = [...new Set([listing.title, listing.location].flatMap((value) => {
    const phrase = value?.trim();
    return phrase && phrase.length >= 3 && phrase.length <= 48 && !/[\r\n]/.test(phrase) ? [phrase] : [];
  }))];
  const parts: { start: number; end: number; kind: "note" | "strong" }[] = [];
  const blocked = [...description.matchAll(/\bhttps?:\/\/[^\s<>]+|^[ \t]*(?:Official source|Source last checked):[^\r\n]*/gmi)];
  for (const match of blocked) {
    if (/^[ \t]*Source last checked:[ \t]*\S/i.test(match[0])) {
      parts.push({ start: match.index, end: match.index + match[0].length, kind: "note" });
    }
  }
  for (const phrase of phrases) {
    let start = description.indexOf(phrase);
    while (start !== -1) {
      const end = start + phrase.length;
      const word = /[\p{L}\p{N}_]/u;
      if (!word.test(description[start - 1] ?? "") && !word.test(description[end] ?? "")
        && !blocked.some((span) => start < span.index + span[0].length && end > span.index)
        && !parts.some((part) => start < part.end && end > part.start)) {
        parts.push({ start, end, kind: "strong" });
        break;
      }
      start = description.indexOf(phrase, end);
    }
  }
  if (parts.length === 0) return description;

  let cursor = 0;
  const content = parts.sort((a, b) => a.start - b.start).flatMap(({ start, end, kind }) => {
    const prefix = description.slice(cursor, start);
    const text = description.slice(start, end);
    cursor = end;
    return [prefix, kind === "note"
      ? <span key={start} className="metadata-text">{text}</span>
      : <strong key={start} className="font-semibold text-foreground">{text}</strong>];
  });
  return [...content, description.slice(cursor)];
}

function Brief({ item, detailContext }: { item: RankedOpportunity; detailContext: string }) {
  const { opportunity: job, match } = item;
  const listing = "url" in job ? job : null;
  const company = job.organization?.trim();
  const monogram = company ? Array.from(company)[0].toUpperCase() : "–";
  const officialUrl = safeJobSource(listing?.url);
  const description = listing && briefDescription(listing, officialUrl);
  const facts: { label: string; icon: IconName; value?: string }[] = [
    { label: "Degree level", icon: "profile", value: listing?.degree_level ? degreeLabels[listing.degree_level] : undefined },
    { label: "Study year", icon: "applications", value: studyYears(listing?.study_year) },
    { label: "Application deadline", icon: "calendar", value: job.deadline?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0] },
    { label: "Published", icon: "clock", value: cardDate(listing?.posted_at) },
  ];
  const knownFacts = facts.filter(({ value }) => value);
  return <article className="@container min-w-0 space-y-6 p-2 sm:p-4">
    <header className="rounded-panel border border-accent/15 bg-primary/10 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <CompanyAvatar companyName={company} initials={monogram} logoUrl={item.companyLogoUrl} />
        <p className="min-w-0 text-sm font-medium text-foreground/90 [overflow-wrap:anywhere]">{company || "Organization not specified"}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="min-w-0 flex-[1_1_15rem]">
          <h2 className="section-title @sm:text-3xl">{job.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{opportunityTypeLabel(job.opportunity_type)}</span>
            {listing?.location && <span className="inline-flex min-w-0 items-start gap-1.5 [overflow-wrap:anywhere]">
              <Icon name="location" className="size-4" />{listing.location}
            </span>}
          </div>
        </div>
        {listing && <MatchScore score={match?.score ?? null} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {listing && <EligibilityBadge status={match?.eligibility ?? "unknown"} />}
        {listing?.is_active === false && <Badge>Closed on InternCalling</Badge>}
        {!listing && item.status && <Badge className="capitalize">{item.status}</Badge>}
      </div>
    </header>
    {knownFacts.length > 0 && <section className="space-y-3">
      <h3 className="card-title">At a glance</h3>
      <dl className="grid gap-3 @xs:grid-cols-2">
        {knownFacts.map(({ label, icon, value }) => <div key={label} className="flex min-w-0 items-start gap-2.5">
          <Icon name={icon} className="mt-0.5 size-4 text-accent" />
          <div className="min-w-0">
            <dt className="metadata-text">{label}</dt>
            <dd className="text-sm text-foreground [overflow-wrap:anywhere]">{value}</dd>
          </div>
        </div>)}
      </dl>
    </section>}
    {listing && listing.skills.length > 0 && <ul aria-label="Skills" className="flex flex-wrap gap-2">
      {listing.skills.map((skill) => <li key={skill.id} className="max-w-full [overflow-wrap:anywhere]"><Badge className="!text-foreground">{skill.name}</Badge></li>)}
    </ul>}
    <div className="flex flex-wrap items-center gap-3">
      {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        View official listing <Icon name="external-link" className="size-4" /><span className="sr-only"> (opens in a new tab)</span>
      </a>}
      <Link href={"/opportunities/" + encodeURIComponent(job.id) + (detailContext ? "?" + detailContext : "")}
        prefetch={false} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-accent hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        View full details
      </Link>
    </div>
    {description && <section className="border-t border-line pt-5">
      <h3 className="card-title">About the opportunity</h3>
      <p className="reading-text mt-3 max-w-prose whitespace-pre-wrap [overflow-wrap:anywhere]">{description}</p>
    </section>}
    {listing && <section>
      <h3 className="card-title">Your match</h3>
      {match ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground/90 [overflow-wrap:anywhere]">{match.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        : <p className="mt-3 text-sm leading-6 text-muted">Your match is currently unavailable. You can still review the opportunity.</p>}
    </section>}
    {listing && <TailoringEntryPoint title={job.title} organization={job.organization ?? ""} />}
  </article>;
}

function SaveControl({ item, saveAction }: {
  item: RankedOpportunity;
  saveAction?: (id: string) => Promise<SaveResult>;
}) {
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const [result, setResult] = useState<SaveResult>();
  const status = item.status ?? (result && "status" in result ? result.status : undefined);
  if (status) return <span role="status"><Badge className="capitalize">{status}</Badge></span>;
  if (!saveAction) return null;
  const save = saveAction;
  const error = result && "error" in result ? result.error : undefined;

  function submit() {
    if (saving.current) return;
    saving.current = true;
    setResult(undefined);
    startTransition(async () => {
      try {
        setResult(await save(item.opportunity.id));
      } catch {
        setResult({ error: "We could not confirm the save. Try again." });
      } finally {
        saving.current = false;
      }
    });
  }

  return <div className="relative z-10 flex flex-col items-end gap-1 text-right">
    <Button variant="secondary" size="sm" disabled={pending} onClick={submit} aria-label={`${pending ? "Saving" : error ? "Retry save for" : "Save"} ${item.opportunity.title}`}>
      {pending ? "Saving…" : error ? "Retry save" : "Save"}
    </Button>
    {error && <p role="alert" className="max-w-48 text-xs text-muted">{error}</p>}
  </div>;
}

export function RecommendedJobs({ items, label = "Recommended opportunities", saveAction, detailContext = "" }: {
  items: RankedOpportunity[];
  label?: string;
  saveAction?: (id: string) => Promise<SaveResult>;
  detailContext?: string;
}) {
  const [selected, setSelected] = useState(items[0]?.opportunity.id);
  const [open, setOpen] = useState(false);
  const current = items.find((item) => item.opportunity.id === selected) ?? items[0];
  if (!current) return null;
  return <>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="min-w-0 space-y-3" aria-label={label}>
        {items.map((item) => <JobCard
          key={item.opportunity.id}
          job={summary(item)}
          density="compact"
          selected={current.opportunity.id === item.opportunity.id}
          showMatch={"url" in item.opportunity}
          metadata={cardMetadata(item.opportunity)}
          officialUrl={"url" in item.opportunity ? safeJobSource(item.opportunity.url) : null}
          onSelect={() => { setSelected(item.opportunity.id); setOpen(true); }}
          action={<SaveControl item={item} saveAction={saveAction} />}
        />)}
      </div>
      <div className="sticky top-6 hidden max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-panel bg-surface/60 p-4 xl:block" aria-label="Selected opportunity">
        <Brief item={current} detailContext={detailContext} />
      </div>
    </div>
    <Drawer open={open} onClose={() => setOpen(false)} title="Opportunity details" size="detail" closeAt="(min-width: 1280px)">
      <Brief item={current} detailContext={detailContext} />
    </Drawer>
  </>;
}
