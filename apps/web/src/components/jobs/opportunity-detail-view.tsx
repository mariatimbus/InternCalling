import Link from "next/link";
import type { ReactNode } from "react";
import type { Application, Eligibility, Opportunity, Skill } from "@/lib/api/types";
import type { OpportunityAssessment } from "@/lib/api/opportunity-assessment";
import { CompanyAvatar } from "@/components/jobs/company-avatar";
import { TailoringEntryPoint } from "@/components/jobs/tailoring-entry-point";
import { ApplicationControls } from "@/components/applications/application-controls";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { opportunityTypeLabel } from "@/lib/opportunities";
import { companyLogoUrl as logoFor } from "@/lib/company-logo";
import { structureDescription } from "@/lib/job-description";
import { isSkillList } from "@/lib/profile-skills";
import { prepareOpportunityCopilot, type OpportunityCopilotData } from "@/lib/opportunity-copilot";
import { degreeLabels, safeJobSource, studyYears } from "@/components/jobs/opportunity-details";

type DetailHeadingLevel = "h3" | "h4" | "h5";

function matchExplanation({ score, positiveReasons, components, gaps, note }: NonNullable<OpportunityCopilotData["match"]>, ReasonHeading: DetailHeadingLevel) {
  return <>
    <p className="card-title text-2xl tabular-nums">{score + "/100"}</p>
    <p className="metadata-text mt-1">Measures how closely this opportunity fits your profile.</p>
    <ReasonHeading className="card-title mt-4 text-sm">Why this fits</ReasonHeading>
    {positiveReasons.length > 0
      ? <ul className="reading-text mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
        {positiveReasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      : <p className="metadata-text mt-2">No positive match reasons were provided for this opportunity.</p>}
    {gaps.length > 0 && <>
      <ReasonHeading className="card-title mt-4 text-sm">To stand out</ReasonHeading>
      <ul className="reading-text mt-2 list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]">
        {gaps.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <Link href="/profile#profile-skills-title" prefetch={false} className="mt-2 inline-flex min-h-10 items-center text-sm text-accent underline">Add the ones you already have</Link>
    </>}
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
    {note && <p className="metadata-text mt-2">{note}, so the score is slightly lower.</p>}
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

function eligibilityExplanation({ status, rules, toCheck }: NonNullable<OpportunityCopilotData["eligibility"]>, DetailHeading: DetailHeadingLevel, copilotEnabled: boolean) {
  return <>
    <p className={status === "not_eligible" ? "card-title text-lg" : "reading-text font-semibold"}>
      {eligibilityVerdicts[status]}
    </p>
    <DetailHeading className="card-title mt-4 text-sm">What to check</DetailHeading>
    {toCheck.length > 0 ? <ul className="reading-text mt-2 list-disc space-y-2 pl-5 text-sm [overflow-wrap:anywhere]">
      {toCheck.map(([key, { labels, status, nextStep, reason }]) => <li key={key}>
        <strong className="capitalize">{labels.join(", ")}</strong>
        <span className={status === "not_eligible" ? "font-semibold" : "metadata-text"}>{" · " + ruleOutcomes[status]}</span>
        {(reason || (!copilotEnabled && nextStep)) && <span className="block">{reason ?? nextStep}</span>}
      </li>)}
    </ul> : <p className="metadata-text mt-2">{rules.length === 0
      ? "No per-rule eligibility details are available."
      : "No unmet or unverified criteria were reported."}</p>}
    {rules.length > 0 && <details className="mt-4 border-t border-line pt-2">
      <summary className="cursor-pointer rounded-sm py-2 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Eligibility details</summary>
      <ul aria-label="Eligibility criteria" className="mt-2 space-y-3">
        {rules.map(({ rule, label, status, reason }) => <li key={rule} className="min-w-0 [overflow-wrap:anywhere]">
          <p className="reading-text text-sm font-semibold capitalize">{label}</p>
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

function cleanDescription(listing: Opportunity, officialUrl: string | null) {
  const source = listing.description ?? "";
  const description = source.replace(/^[ \t]*Official source:[ \t]+(?:<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>]+))[ \t]*(?:\r?\n|$)/gmi,
    (line, bracketed, bare) => officialUrl && safeJobSource(bracketed ?? bare) === officialUrl ? "" : line);
  return description.trim() ? description : null;
}

/** Bold the listing's own title and location once each; keep source notes quiet; never touch URLs. */
function inlineText(text: string, phrases: string[], used: Set<string>): ReactNode {
  if (/^Source last checked:[ \t]*\S/i.test(text)) return <span className="metadata-text">{text}</span>;
  const blocked = [...text.matchAll(/\bhttps?:\/\/[^\s<>]+|^(?:Official source|Source last checked):.*/gi)];
  const parts: { start: number; end: number }[] = [];
  for (const phrase of phrases) {
    if (used.has(phrase)) continue;
    let start = text.indexOf(phrase);
    while (start !== -1) {
      const end = start + phrase.length;
      const word = /[\p{L}\p{N}_]/u;
      if (!word.test(text[start - 1] ?? "") && !word.test(text[end] ?? "")
        && !blocked.some((span) => start < span.index + span[0].length && end > span.index)
        && !parts.some((part) => start < part.end && end > part.start)) {
        parts.push({ start, end });
        used.add(phrase);
        break;
      }
      start = text.indexOf(phrase, end);
    }
  }
  if (parts.length === 0) return text;
  let cursor = 0;
  const content = parts.sort((a, b) => a.start - b.start).flatMap(({ start, end }) => {
    const prefix = text.slice(cursor, start);
    cursor = end;
    return [prefix, <strong key={start} className="font-semibold text-foreground">{text.slice(start, end)}</strong>];
  });
  return [...content, text.slice(cursor)];
}

function bulletText(text: string, phrases: string[], used: Set<string>): ReactNode {
  const label = /^[\p{L}\p{N}][\p{L}\p{N} \t/&’'()+-]{0,59}:(?=\s+\S)/u.exec(text)?.[0];
  if (!label || /^(?:Official source|Source last checked):/i.test(text)) return inlineText(text, phrases, used);
  return <><strong className="font-bold text-foreground">{label}</strong>{inlineText(text.slice(label.length), phrases, used)}</>;
}

function descriptionHeadingIcon(title: string): IconName {
  if (/responsibilit|duties|what you(?:['’]ll| will) do/i.test(title)) return "jobs";
  if (/qualif|require|skill|preferred/i.test(title)) return "check";
  if (/benefit|perk|offer/i.test(title)) return "wallet";
  if (/about|company|team/i.test(title)) return "globe";
  return "applications";
}

function descriptionBody(listing: Opportunity, text: string, Heading: "h3" | "h4") {
  // Keep title/location emphasis alongside the listing's own short bullet labels.
  const phrases = [...new Set([listing.title, listing.location].flatMap((value) => {
    const phrase = value?.trim();
    return phrase && phrase.length >= 3 && phrase.length <= 48 && !/[\r\n]/.test(phrase) ? [phrase] : [];
  }))];
  const used = new Set<string>();
  return <div className="reading-text mt-4 max-w-prose space-y-4 leading-7 [overflow-wrap:anywhere]">
    {structureDescription(text).map((block, index) => block.kind === "heading"
      ? <Heading key={index} className="mt-7 flex items-center gap-3 border-t border-line pt-6 text-lg font-bold text-foreground">
          <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-accent"><Icon name={descriptionHeadingIcon(block.text)} className="size-5" /></span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{block.text}</span>
        </Heading>
      : block.kind === "list"
        ? <ul key={index} className="list-disc space-y-2 pl-5 marker:text-accent">
          {block.items.map((item, i) => <li key={i}>{bulletText(item, phrases, used)}</li>)}
        </ul>
        : <p key={index}>{inlineText(block.text, phrases, used)}</p>)}
  </div>;
}

function skillComparison(skills: OpportunityCopilotData["skills"], Heading: "h3" | "h4") {
  if (skills.status !== "ready") return <p className="metadata-text">
    {skills.status === "profile-unavailable" ? "Profile skills could not be loaded." : "Skill comparison is unavailable without the full opportunity details."}
  </p>;
  const groups = [
    { label: "Skills matched", skills: skills.matched,
      empty: "No listed skills match those in your profile." },
    { label: "Potential gaps", skills: skills.gaps,
      empty: "No additional listed skills to check." },
  ];
  return <div className="grid gap-3 @sm:grid-cols-2">
    {groups.map(({ label, skills, empty }) => <section key={label} className="min-w-0">
      <Heading className="card-title text-sm">{label}</Heading>
      {label === "Potential gaps" && <p className="metadata-text mt-1">Listed in this opportunity, not added to your profile</p>}
      {skills.length > 0 ? <ul aria-label={label} className="mt-2 flex flex-wrap gap-2">
        {skills.map(({ id, name }) => <li key={id} className="max-w-full [overflow-wrap:anywhere]"><Badge className="!text-foreground">{name}</Badge></li>)}
      </ul> : <p className="metadata-text mt-2">{empty}</p>}
    </section>)}
  </div>;
}

function opportunityDecision(copilot: OpportunityCopilotData, standalone: boolean, copilotEnabled: boolean) {
  const SectionHeading = standalone ? "h2" : "h3";
  const AssessmentHeading = copilotEnabled ? (standalone ? "h3" : "h4") : SectionHeading;
  const DetailHeading = copilotEnabled && !standalone ? "h5" : AssessmentHeading === "h2" ? "h3" : "h4";
  const ActionHeading = standalone ? "h3" : "h4";
  const assessmentCards = <div className="grid items-start gap-4 @sm:grid-cols-2">
    <section className="min-w-0 border-t border-line pt-5">
      <AssessmentHeading className="card-title">Match Score</AssessmentHeading>
      <div className="mt-3" aria-live="polite">
        {copilot.loading ? <p className="metadata-text">Loading match score…</p>
          : copilot.match ? matchExplanation(copilot.match, DetailHeading)
            : <>
              {copilotEnabled && <DetailHeading className="card-title text-sm">Why this fits</DetailHeading>}
              <p className="metadata-text">Match score could not be loaded.</p>
            </>}
      </div>
    </section>
    <section className="min-w-0 border-t border-line pt-5">
      <AssessmentHeading className="card-title">Eligibility</AssessmentHeading>
      <div className="mt-3" aria-live="polite">
        {copilot.loading ? <p className="metadata-text">Loading eligibility…</p>
          : !copilot.eligibility ? <p className="metadata-text">Eligibility could not be loaded.</p>
            : eligibilityExplanation(copilot.eligibility, DetailHeading, copilotEnabled)}
      </div>
    </section>
  </div>;
  return copilotEnabled ? <section aria-label="Opportunity Copilot" className="space-y-6">
        <SectionHeading className="section-title">Opportunity Copilot</SectionHeading>
        {assessmentCards}
        {skillComparison(copilot.skills, ActionHeading)}
        {copilot.eligibility?.suggestProfile && <div aria-live="polite">
          <ActionHeading className="card-title text-sm">Suggested next action</ActionHeading>
          <Link href="/profile" prefetch={false} className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Complete your profile</Link>
        </div>}
      </section> : assessmentCards;
}

export function OpportunityDetailView({ opportunity: job, assessment, status, companyLogoUrl, detailContext = "", standalone = false, saveControl, tracking, copilotEnabled = false, profileSkills = null, catalogStatus }: {
  opportunity: Opportunity | Application["opportunity"];
  assessment: OpportunityAssessment | null;
  status?: Application["status"];
  companyLogoUrl?: string | null;
  detailContext?: string;
  standalone?: boolean;
  saveControl?: ReactNode;
  tracking?: { application: Application | null; showSave?: boolean };
  copilotEnabled?: boolean;
  profileSkills?: Skill[] | null;
  catalogStatus?: "loading" | "loaded" | "failed";
}) {
  const Heading = standalone ? "h1" : "h2";
  const SectionHeading = standalone ? "h2" : "h3";
  const listing = "url" in job ? job : null;
  const listedSkills = isSkillList(listing?.skills) && listing.skills.every(({ id }) => !!id.trim()) ? listing.skills : null;
  const company = job.organization?.trim();
  const monogram = company ? Array.from(company)[0].toUpperCase() : "–";
  const officialUrl = safeJobSource(listing?.url);
  const sourceNotice = !officialUrl && catalogStatus && {
    loading: "Loading official listing…",
    loaded: "No official link is available for this opportunity.",
    failed: "The official listing could not be loaded. Open full details to try again.",
  }[catalogStatus];
  const description = listing && cleanDescription(listing, officialUrl);
  const facts: { label: string; icon: IconName; value?: string }[] = [
    { label: "Degree level", icon: "profile", value: listing?.degree_level ? degreeLabels[listing.degree_level] : undefined },
    { label: "Study year", icon: "applications", value: studyYears(listing?.study_year) },
    { label: "Application deadline", icon: "calendar", value: job.deadline?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0] },
    { label: "Published", icon: "clock", value: opportunityDisplayDate(listing?.posted_at) },
  ];
  const knownFacts = facts.filter(({ value }) => value);
  const copilot = prepareOpportunityCopilot(assessment, listedSkills, profileSkills);
  return <article className="@container flex min-h-0 min-w-0 flex-1 flex-col">
    <div role="region" aria-label="Opportunity information" tabIndex={0}
      className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:p-4">
      <header className="border-b border-line pb-6">
        {(tracking || listing) && <div className="mb-4">
          <ApplicationControls key={`${job.id}:${tracking?.application?.updated_at ?? "new"}`}
            opportunityId={job.id} application={tracking?.application} showSave={tracking?.showSave}
            inline allowTracking={!!tracking}
            tailoring={listing ? <TailoringEntryPoint jobId={job.id} title={job.title} organization={job.organization ?? ""} embedded /> : undefined} />
        </div>}
        <div className="grid items-start gap-5 @lg:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0">
        <div className="flex items-center gap-3">
          <CompanyAvatar companyName={company} initials={monogram} logoUrl={companyLogoUrl ?? logoFor(listing?.company_domain)} />
          <p className="min-w-0 text-sm font-medium text-foreground/90 [overflow-wrap:anywhere]">{company || "Organization not specified"}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="min-w-0 flex-[1_1_15rem]">
            <Heading className={standalone ? "text-2xl font-semibold leading-tight tracking-tight text-foreground @lg:text-3xl" : "section-title"}>{job.title}</Heading>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{opportunityTypeLabel(job.opportunity_type)}</span>
              {listing?.location && <span className="inline-flex min-w-0 items-start gap-1.5 [overflow-wrap:anywhere]">
                <Icon name="location" className="size-4" />{listing.location}
              </span>}
            </div>
          </div>
        </div>
        </div>
        <section aria-label="Match overview" className="rounded-xl border border-accent/25 bg-primary/10 p-4">
          <p className="metadata-text font-semibold">Profile match</p>
          <div className="mt-2" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3 @lg:block">
            {copilot.match ?
              <p className="text-4xl font-bold tracking-tight tabular-nums text-foreground">{copilot.match.score}<span className="ml-1 text-base font-normal text-muted">/100</span></p>
              : <p className="metadata-text">{copilot.loading ? "Loading match score…" : "Match score unavailable"}</p>}
            {copilot.eligibility && <p className="text-sm font-medium text-foreground @lg:mt-3">{eligibilityVerdicts[copilot.eligibility.status]}</p>}
            </div>
            {copilot.match && <p className="metadata-text mt-2">Based on your profile</p>}
          </div>
        </section>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {listing?.is_active === false && <Badge>Closed on InternCalling</Badge>}
          {listing?.is_active === true && <Badge>Active on InternCalling</Badge>}
          {!listing && status && !saveControl && <Badge className="capitalize">{status}</Badge>}
        </div>
      {knownFacts.length > 0 && <section className="mt-5 space-y-3 border-t border-line pt-5">
        <SectionHeading className="card-title">At a glance</SectionHeading>
        <dl className="grid gap-x-6 gap-y-4 @xs:grid-cols-2 @3xl:grid-cols-4">
          {knownFacts.map(({ label, icon, value }) => <div key={label} className="min-w-0">
            <dt className="metadata-text">{label}</dt>
            <dd className="mt-1 flex min-w-0 items-start gap-2 text-sm text-foreground [overflow-wrap:anywhere]">
              <Icon name={icon} className="mt-0.5 size-4 text-accent" />
              <span>{icon === "calendar" ? <time dateTime={value}>{opportunityDisplayDate(value)}</time> : value}</span>
            </dd>
          </div>)}
        </dl>
      </section>}
      </header>
      <div className={standalone ? "grid items-start gap-8 @4xl:grid-cols-[minmax(0,1fr)_19rem]" : "space-y-6"}>
      <div className="min-w-0 space-y-6">
      {!!listedSkills?.length && <ul aria-label="Skills" className="flex flex-wrap gap-2">
        {listedSkills.map((skill) => <li key={skill.id} className="max-w-full [overflow-wrap:anywhere]"><Badge className="!text-foreground">{skill.name}</Badge></li>)}
      </ul>}
        {!standalone && <Link href={"/opportunities/" + encodeURIComponent(job.id) + (detailContext ? "?" + detailContext : "")}
          prefetch={false} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-accent hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          View full details
        </Link>}
      {description && <section>
        <SectionHeading className="section-title">About the opportunity</SectionHeading>
        {listing && descriptionBody(listing, description, standalone ? "h3" : "h4")}
      </section>}
      </div>
      <aside aria-label="Your fit for this opportunity" className={standalone ? "@container min-w-0 @4xl:sticky @4xl:top-0 @4xl:border-l @4xl:border-line @4xl:pl-6" : "@container min-w-0 border-t border-line pt-6"}>
      {opportunityDecision(copilot, standalone, copilotEnabled)}
      </aside>
      </div>
    </div>
    {(officialUrl || saveControl || sourceNotice) && <footer aria-label="Opportunity actions" className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface p-3">
      {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {listing?.is_active ? "Apply on official site" : "View official listing"} <Icon name="external-link" className="size-4" /><span className="sr-only"> (opens in a new tab)</span>
      </a>}
      {saveControl}
      {sourceNotice && <p role="status" className="metadata-text">{sourceNotice}</p>}
    </footer>}
  </article>;
}
