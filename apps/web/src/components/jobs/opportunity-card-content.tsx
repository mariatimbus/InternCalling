import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { CompanyAvatar } from "./company-avatar";
import { EligibilityBadge } from "./eligibility-badge";
import { MatchScore } from "./match-score";
import type { JobSummary } from "./job-card";
import { descriptionSnippet } from "@/lib/job-description";

export type CardDensity = "comfortable" | "compact";

/** Shared opportunity row. Compact density is intended for the split-view list. */
export function opportunityCardClasses(selected = false, density: CardDensity = "comfortable") {
  if (density === "compact") {
    return `group relative flex min-w-0 flex-col gap-3 rounded-card border p-4 motion-safe:transition-colors ${selected ? "border-primary bg-primary/5" : "border-line bg-card hover:border-border"}`;
  }
  return `group relative flex h-full min-w-0 flex-col rounded-card border p-4 motion-safe:transition-colors sm:p-5 ${selected ? "border-primary bg-primary/5" : "border-line bg-card hover:border-border"}`;
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
      <div className="flex items-start gap-4">
        <CompanyAvatar companyName={job.company} initials={job.initials} logoUrl={job.companyLogoUrl} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="accent">{job.category ?? "Internship"}</Badge>{job.postedLabel && <span className="metadata-text">{job.postedLabel}</span>}</div>
          {heading}
          <p className="mt-1 text-sm font-medium text-muted">{job.company}</p>
        </div>
        {action}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t border-line pt-3 text-sm text-muted">
        <p className="flex min-w-0 items-start gap-2"><Icon name="location" className="mt-0.5 size-4" /><span className="min-w-0 [overflow-wrap:anywhere]">{job.location}</span></p>
        {job.duration && <p className="flex items-center gap-2"><Icon name="calendar" className="size-4" />{job.duration}</p>}
        {job.compensation && <p className="flex items-start gap-2"><Icon name="wallet" className="size-4" />{job.compensation}</p>}
        {job.workMode && <p className="flex items-center gap-2"><Icon name="clock" className="size-4" />{job.workMode}</p>}
        {(job.deadlineText || job.deadlineLabel) && <p className="flex items-start gap-2"><Icon name="calendar" className="mt-0.5 size-4" />{job.deadlineText ?? job.deadlineLabel}</p>}
      </div>
      {descriptionSnippet(job.description) && <p className="reading-text mt-3 line-clamp-2">{descriptionSnippet(job.description)}</p>}
      {(job.skills.length > 0 || applied) && <div className="mt-3 flex flex-wrap gap-1.5">{job.skills.slice(0, 5).map((skill) => <Badge key={skill}>{skill}</Badge>)}{applied && <Badge variant="accent">Applied</Badge>}</div>}
      {showMatch && job.matchReason && <p className="mt-3 flex items-start gap-1.5 text-sm text-foreground"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />{job.matchReason}</p>}
      {showMatch && <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4"><EligibilityBadge status={job.eligibility} /><MatchScore score={job.matchScore} size="sm" /></div>}
    </>
  );
}
