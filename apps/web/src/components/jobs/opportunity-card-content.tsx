import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { CompanyMark } from "./company-mark";
import { CompanyAvatar } from "./company-avatar";
import { EligibilityBadge } from "./eligibility-badge";
import { MatchScore } from "./match-score";
import type { JobSummary } from "./job-card";
import { descriptionSnippet } from "@/lib/job-description";

export type CardDensity = "comfortable" | "compact";

/** Shared soft card frame. Compact density is intended for the split-view list. */
export function opportunityCardClasses(selected = false, density: CardDensity = "comfortable") {
  if (density === "compact") {
    return `group relative flex min-w-0 flex-col gap-2 rounded-card border border-s-4 px-3 py-3 motion-safe:transition-colors sm:px-4 ${selected ? "border-line border-s-accent bg-primary/20" : "border-line border-s-transparent bg-card hover:bg-elevated"}`;
  }
  return `group relative flex h-full flex-col rounded-card border p-6 motion-safe:transition-colors motion-safe:duration-200 sm:p-8 ${selected ? "border-accent/40 bg-primary/15" : "border-transparent bg-card hover:border-accent/25 hover:bg-elevated"}`;
}

/** Shared information hierarchy; callers provide a native link or button as the heading. */
export function OpportunityCardContent({ job, heading, action, density = "comfortable", applied = false, showMatch = true }: {
  job: JobSummary;
  heading: ReactNode;
  action?: ReactNode;
  density?: CardDensity;
  applied?: boolean;
  showMatch?: boolean;
}) {
  if (density === "compact") return <>
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-[1_1_14rem] items-start gap-3">
        <CompanyAvatar companyName={job.company} initials={job.initials} logoUrl={job.companyLogoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          {heading}
          <div className="flex flex-wrap items-start metadata-text gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
            <span className="min-w-0 font-medium text-foreground/90">{job.company}</span>
            <span className="inline-flex min-w-0 items-start gap-1"><Icon name="location" className="mt-0.5 size-3.5" /><span className="min-w-0">{job.location}</span></span>
          </div>
        </div>
      </div>
      {(action || showMatch) && <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        {showMatch && <MatchScore score={job.matchScore} size="sm" />}
        {action}
      </div>}
    </div>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant="accent">{job.category ?? "Internship"}</Badge>
      {applied && <Badge variant="accent">Applied</Badge>}
      {showMatch && job.eligibility !== "unknown" && <EligibilityBadge status={job.eligibility} />}
      {job.skills.slice(0, 3).map((skill) => <Badge key={skill} className="max-w-full [overflow-wrap:anywhere]">{skill}</Badge>)}
    </div>
    {showMatch && job.matchReason && <p className="flex min-w-0 items-start gap-1.5 text-sm text-foreground [overflow-wrap:anywhere]"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" /><span className="line-clamp-1">{job.matchReason}</span></p>}
    {descriptionSnippet(job.description) && <p className="reading-text line-clamp-2 [overflow-wrap:anywhere]">{descriptionSnippet(job.description)}</p>}
    {(job.duration || job.compensation || job.workMode) && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {job.duration && <span>{job.duration}</span>}
      {job.compensation && <span>{job.compensation}</span>}
      {job.workMode && <span>{job.workMode}</span>}
    </div>}
  </>;
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Badge variant="accent">{job.category ?? "Internship"}</Badge>
        {action}
      </div>
      <div className="flex items-start gap-4">
        <CompanyMark initials={job.initials} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted">{job.company}</p>
          {heading}
          <div className="mt-3 space-y-2 text-xs text-muted">
            <p className="flex items-start gap-2"><Icon name="location" className="size-3.5" />{job.location}</p>
            {job.duration && <p className="flex items-center gap-2"><Icon name="calendar" className="size-3.5" />{job.duration}</p>}
          </div>
        </div>
      </div>
      {descriptionSnippet(job.description) && <p className="reading-text mt-6 line-clamp-3">{descriptionSnippet(job.description)}</p>}
      <div className="mt-6 space-y-2.5 text-xs text-muted">
        {job.compensation && <p className="flex items-start gap-2"><Icon name="wallet" className="size-3.5" />{job.compensation}</p>}
        {job.workMode && <p className="flex items-center gap-2"><Icon name="clock" className="size-3.5" />{job.workMode}</p>}
        {(job.deadlineText || job.deadlineLabel) && <p className="flex items-start gap-2 leading-relaxed"><Icon name="calendar" className="mt-0.5 size-3.5" />{job.deadlineText ?? job.deadlineLabel}</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{job.skills.slice(0, 3).map((skill) => <Badge key={skill}>{skill}</Badge>)}{applied && <Badge variant="accent">Applied</Badge>}</div>
      {showMatch && job.matchReason && <p className="mt-5 flex items-start gap-1.5 text-sm text-foreground"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />{job.matchReason}</p>}
      {showMatch && <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6"><EligibilityBadge status={job.eligibility} /><MatchScore score={job.matchScore} size="sm" /></div>}
    </>
  );
}
