import Link from "next/link";
import type { ReactNode } from "react";
import type { Application, Eligibility, Match, Opportunity } from "@/lib/api/types";
import type { OpportunityAssessment } from "@/lib/api/opportunity-assessment";
import { CompanyAvatar } from "@/components/jobs/company-avatar";
import { TailoringEntryPoint } from "@/components/jobs/tailoring-entry-point";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { opportunityTypeLabel } from "@/lib/opportunities";
import { companyLogoUrl as logoFor } from "@/lib/company-logo";
import { degreeLabels, safeJobSource, studyYears } from "@/components/jobs/opportunity-details";

const scoreComponents = [
  ["skills", "Skills"],
  ["field_fit", "Field of study"],
  ["interests", "Interests"],
  ["location", "Location"],
  ["ai", "AI similarity"],
] as const;

const aiEvaluation = /^AI similarity: (?:0\.\d{2}|1\.00) \(embeddings\)$/;
const capReason = "Eligibility not fully confirmed; score capped";

function matchExplanation(match: Match, ReasonHeading: "h3" | "h4") {
  const reasons = match.reasons ?? [];
  const aiPoints = match.components?.ai;
  const positiveReasons = reasons.filter((reason) =>
    /^(?:Skill overlap|Field keywords found|Matches interests): \S/.test(reason)
    || reason === "Remote-friendly location"
    || reason === "Location matches the student's preference"
    || (aiPoints > 0 && aiEvaluation.test(reason))
  );
  const aiEvaluated = aiPoints > 0 || reasons.some((reason) => aiEvaluation.test(reason));
  const components = scoreComponents.flatMap(([key, label]) => {
    const points = match.components?.[key];
    return Number.isFinite(points) && (key !== "ai" || aiEvaluated) ? [{ label, points }] : [];
  });

  return <>
    <p className="card-title text-2xl tabular-nums">{match.score + "/100"}</p>
    <p className="metadata-text mt-1">Measures how closely this opportunity fits your profile.</p>
    <ReasonHeading className="card-title mt-4 text-sm">Why this fits</ReasonHeading>
    {positiveReasons.length > 0
      ? <ul className="reading-text mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
        {positiveReasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      : <p className="metadata-text mt-2">No positive match reasons were provided for this opportunity.</p>}
    <details className="mt-4 border-t border-line pt-2">
      <summary className="cursor-pointer rounded-sm py-2 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Score breakdown</summary>
      {components.length > 0
        ? <dl className="space-y-1 py-1 text-sm">
          {components.map(({ label, points }) => <div key={label} className="flex flex-wrap justify-between gap-x-3">
            <dt className="metadata-text">{label}</dt>
            <dd className="reading-text tabular-nums">{points + (points === 1 ? " point" : " points")}</dd>
          </div>)}
        </dl>
        : <p className="metadata-text">No component values were provided.</p>}
    </details>
    {reasons.includes(capReason) && <p className="metadata-text mt-2">The maximum Match Score is 49/100 while eligibility is unconfirmed.</p>}
  </>;
}

const eligibilityVerdicts: Record<Eligibility["status"], string> = {
  eligible: "Eligible",
  possibly_eligible: "Possibly eligible",
  not_eligible: "Not eligible",
  unknown: "Eligibility unknown.",
};

const ruleOutcomes: Record<Eligibility["status"], string> = {
  eligible: "Meets requirement",
  possibly_eligible: "Needs confirmation",
  not_eligible: "Confirmed mismatch",
  unknown: "Unverified",
};

// A9 returns human-readable reasons, but no structured missing-data source.
// Only the known reasons that identify a source get a source-specific next step.
const checkOfficialListing = "Check the official listing.";
const eligibilityNextSteps = new Map([
  ["Student has not declared a degree level", "Add your degree level to your profile."],
  ["Student study year is not known", "Check your current study year against the accepted years."],
  ["Student graduation year is not known", "Add your expected graduation year to your profile."],
  ["Student location is not known; cannot compare", "Add your location to your profile."],
  ["Opportunity does not specify a degree level", checkOfficialListing],
  ["Opportunity does not specify accepted study years", checkOfficialListing],
  ["No structured graduation restriction available", checkOfficialListing],
  ["Opportunity does not specify a location", checkOfficialListing],
]);

function eligibilityExplanation(eligibility: Eligibility, DetailHeading: "h3" | "h4") {
  const rules = eligibility.reasons ?? [];
  const checks = new Map<string, { labels: string[]; status: Eligibility["status"]; nextStep?: string; reason?: string }>();
  for (const { rule, status, reason } of rules) {
    if (status === "eligible") continue;
    const nextStep = status === "not_eligible" ? undefined : eligibilityNextSteps.get(reason);
    const key = nextStep ? status + nextStep : rule;
    const label = rule.replaceAll("_", " ");
    const grouped = checks.get(key);
    if (grouped) grouped.labels.push(label);
    else checks.set(key, { labels: [label], status, nextStep, reason: status === "not_eligible" ? reason : undefined });
  }
  const toCheck = Array.from(checks).sort(([, a], [, b]) =>
    Number(b.status === "not_eligible") - Number(a.status === "not_eligible"));
  return <>
    <p className={eligibility.status === "not_eligible" ? "card-title text-lg" : "reading-text font-semibold"}>
      {eligibilityVerdicts[eligibility.status]}
    </p>
    <DetailHeading className="card-title mt-4 text-sm">What to check</DetailHeading>
    {toCheck.length > 0 ? <ul className="reading-text mt-2 list-disc space-y-2 pl-5 text-sm [overflow-wrap:anywhere]">
      {toCheck.map(([key, { labels, status, nextStep, reason }]) => <li key={key}>
        <strong className="capitalize">{labels.join(", ")}</strong>
        <span className={status === "not_eligible" ? "font-semibold" : "metadata-text"}>{" · " + ruleOutcomes[status]}</span>
        {(nextStep || reason) && <span className="block">{nextStep ?? reason}</span>}
      </li>)}
    </ul> : <p className="metadata-text mt-2">{rules.length === 0
      ? "No per-rule eligibility details are available."
      : "No unmet or unverified criteria were reported."}</p>}
    {rules.length > 0 && <details className="mt-4 border-t border-line pt-2">
      <summary className="cursor-pointer rounded-sm py-2 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Eligibility details</summary>
      <ul aria-label="Eligibility criteria" className="mt-2 space-y-3">
        {rules.map(({ rule, status, reason }) => <li key={rule} className="min-w-0 [overflow-wrap:anywhere]">
          <p className="reading-text text-sm font-semibold capitalize">{rule.replaceAll("_", " ")}</p>
          <p className="metadata-text">{ruleOutcomes[status]}</p>
          {reason && <p className="reading-text text-sm">{reason}</p>}
        </li>)}
      </ul>
    </details>}
  </>;
}

export function opportunityDisplayDate(value: string | null | undefined) {
  if (!value) return;
  const timestamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(value) ? value + "Z" : value;
  const date = new Date(timestamp);
  if (Number.isFinite(date.getTime())) return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
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

export function OpportunityDetailView({ opportunity: job, assessment, status, companyLogoUrl, detailContext = "", standalone = false, saveControl, applicationControls }: {
  opportunity: Opportunity | Application["opportunity"];
  assessment: OpportunityAssessment | null;
  status?: Application["status"];
  companyLogoUrl?: string | null;
  detailContext?: string;
  standalone?: boolean;
  saveControl?: ReactNode;
  applicationControls?: ReactNode;
}) {
  const Heading = standalone ? "h1" : "h2";
  const SectionHeading = standalone ? "h2" : "h3";
  const listing = "url" in job ? job : null;
  const company = job.organization?.trim();
  const monogram = company ? Array.from(company)[0].toUpperCase() : "–";
  const officialUrl = safeJobSource(listing?.url);
  const description = listing && briefDescription(listing, officialUrl);
  const facts: { label: string; icon: IconName; value?: string }[] = [
    { label: "Degree level", icon: "profile", value: listing?.degree_level ? degreeLabels[listing.degree_level] : undefined },
    { label: "Study year", icon: "applications", value: studyYears(listing?.study_year) },
    { label: "Application deadline", icon: "calendar", value: job.deadline?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0] },
    { label: "Published", icon: "clock", value: opportunityDisplayDate(listing?.posted_at) },
  ];
  const knownFacts = facts.filter(({ value }) => value);
  return <article className="@container flex min-h-0 min-w-0 flex-1 flex-col">
    <div role="region" aria-label="Opportunity information" tabIndex={0}
      className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:p-4">
      <header className="rounded-panel border border-accent/15 bg-primary/10 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <CompanyAvatar companyName={company} initials={monogram} logoUrl={companyLogoUrl ?? logoFor(listing?.company_domain)} />
          <p className="min-w-0 text-sm font-medium text-foreground/90 [overflow-wrap:anywhere]">{company || "Organization not specified"}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="min-w-0 flex-[1_1_15rem]">
            <Heading className={standalone ? "page-title" : "section-title @sm:text-3xl"}>{job.title}</Heading>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{opportunityTypeLabel(job.opportunity_type)}</span>
              {listing?.location && <span className="inline-flex min-w-0 items-start gap-1.5 [overflow-wrap:anywhere]">
                <Icon name="location" className="size-4" />{listing.location}
              </span>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {listing?.is_active === false && <Badge>Closed on InternCalling</Badge>}
          {listing?.is_active === true && <Badge>Active on InternCalling</Badge>}
          {!listing && status && !saveControl && <Badge className="capitalize">{status}</Badge>}
        </div>
      </header>
      {knownFacts.length > 0 && <section className="space-y-3">
        <SectionHeading className="card-title">At a glance</SectionHeading>
        <dl className="grid gap-3 @xs:grid-cols-2">
          {knownFacts.map(({ label, icon, value }) => <div key={label} className="flex min-w-0 items-start gap-2.5">
            <Icon name={icon} className="mt-0.5 size-4 text-accent" />
            <div className="min-w-0">
              <dt className="metadata-text">{label}</dt>
              <dd className="text-sm text-foreground [overflow-wrap:anywhere]">{icon === "calendar" ? <time dateTime={value}>{value}</time> : value}</dd>
            </div>
          </div>)}
        </dl>
      </section>}
      {listing && listing.skills.length > 0 && <ul aria-label="Skills" className="flex flex-wrap gap-2">
        {listing.skills.map((skill) => <li key={skill.id} className="max-w-full [overflow-wrap:anywhere]"><Badge className="!text-foreground">{skill.name}</Badge></li>)}
      </ul>}
        {!standalone && <Link href={"/opportunities/" + encodeURIComponent(job.id) + (detailContext ? "?" + detailContext : "")}
          prefetch={false} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-accent hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          View full details
        </Link>}
      {description && <section className="border-t border-line pt-5">
        <SectionHeading className="card-title">About the opportunity</SectionHeading>
        <p className="reading-text mt-3 max-w-prose whitespace-pre-wrap [overflow-wrap:anywhere]">{description}</p>
      </section>}
      <div className="grid items-start gap-4 @sm:grid-cols-2">
        <section className="min-w-0 rounded-card border border-line bg-card p-4">
          <SectionHeading className="card-title">Match Score</SectionHeading>
          <div className="mt-3" aria-live="polite">
            {!assessment ? <p className="metadata-text">Loading match score…</p>
              : assessment.match && Number.isFinite(assessment.match.score) ? matchExplanation(assessment.match, standalone ? "h3" : "h4")
                : <p className="metadata-text">Match score could not be loaded.</p>}
          </div>
        </section>
        <section className="min-w-0 rounded-card border border-line bg-card p-4">
          <SectionHeading className="card-title">Eligibility</SectionHeading>
          <div className="mt-3" aria-live="polite">
            {!assessment ? <p className="metadata-text">Loading eligibility…</p>
              : !assessment.eligibility ? <p className="metadata-text">Eligibility could not be loaded.</p>
                : eligibilityExplanation(assessment.eligibility, standalone ? "h3" : "h4")}
          </div>
        </section>
      </div>
      {applicationControls}
      {listing && !standalone && <TailoringEntryPoint jobId={job.id} title={job.title} organization={job.organization ?? ""} />}
    </div>
    {(officialUrl || saveControl) && <footer aria-label="Opportunity actions" className="flex shrink-0 flex-wrap items-start gap-2 border-t border-line bg-surface p-3">
      {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {listing?.is_active ? "Apply on official site" : "View official listing"} <Icon name="external-link" className="size-4" /><span className="sr-only"> (opens in a new tab)</span>
      </a>}
      {saveControl}
    </footer>}
  </article>;
}
