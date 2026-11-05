import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { CompanyMark } from "./company-mark";
import { EligibilityBadge } from "./eligibility-badge";
import { MatchScore } from "./match-score";
import type { JobSummary } from "./job-card";

export type CardDensity = "comfortable" | "compact";

/** Shared soft card frame. Compact density is intended for the split-view list. */
export function opportunityCardClasses(selected = false, density: CardDensity = "comfortable") {
  return `group relative flex h-full flex-col rounded-card border motion-safe:transition-colors motion-safe:duration-200 ${density === "comfortable" ? "p-6 sm:p-8" : "p-5 sm:p-6"} ${selected ? "border-accent/40 bg-primary/15" : "border-transparent bg-card hover:border-accent/25 hover:bg-elevated"}`;
}

/** Shared information hierarchy; callers provide a native link or button as the heading. */
export function OpportunityCardContent({ job, heading, action, density = "comfortable", applied = false }: {
  job: JobSummary;
  heading: ReactNode;
  action?: ReactNode;
  density?: CardDensity;
  applied?: boolean;
}) {
  const compact = density === "compact";
  return (
    <>
      <div className={`flex items-center justify-between gap-3 ${compact ? "mb-4" : "mb-6"}`}>
        <Badge variant="accent">Internship</Badge>
        {action}
      </div>
      <div className="flex items-start gap-4">
        <CompanyMark initials={job.initials} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted">{job.company}</p>
          {heading}
          <div className="mt-3 space-y-2 text-xs text-muted">
            <p className="flex items-start gap-2"><Icon name="location" className="size-3.5" />{job.location}</p>
            <p className="flex items-center gap-2"><Icon name="calendar" className="size-3.5" />{job.duration}</p>
          </div>
        </div>
      </div>
      {job.description && <p className={`leading-7 text-foreground/90 ${compact ? "mt-4 line-clamp-2 text-sm" : "mt-6 line-clamp-3 text-base"}`}>{job.description}</p>}
      <div className={`space-y-2.5 text-xs text-muted ${compact ? "mt-4" : "mt-6"}`}>
        <p className="flex items-start gap-2"><Icon name="wallet" className="size-3.5" />{job.compensation}</p>
        <p className="flex items-center gap-2"><Icon name="clock" className="size-3.5" />{job.workMode}</p>
        {!compact && (job.deadlineText || job.deadlineLabel) && <p className="flex items-start gap-2 leading-relaxed"><Icon name="calendar" className="mt-0.5 size-3.5" />{job.deadlineText ?? job.deadlineLabel}</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{job.skills.slice(0, 3).map((skill) => <Badge key={skill}>{skill}</Badge>)}{applied && <Badge variant="accent">Applied</Badge>}</div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6"><EligibilityBadge status={job.eligibility} /><MatchScore score={job.matchScore} size="sm" /></div>
    </>
  );
}
