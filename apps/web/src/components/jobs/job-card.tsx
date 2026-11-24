import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { EligibilityStatus } from "./eligibility-badge";
import { OpportunityCardContent, opportunityCardClasses, type CardDensity } from "./opportunity-card-content";

/** Presentation model, independent of API response shapes. */
export type JobSummary = {
  id: string; title: string; company: string; initials: string; location: string; country: string;
  workMode: "Hybrid" | "Remote" | "On-site" | null;
  duration: string; compensation: string; postedLabel: string; skills: readonly string[];
  matchScore: number | null; eligibility: EligibilityStatus;
  description?: string;
  companyLogoUrl?: string | null;
  /** The strongest match reason, e.g. "Matches 3 of 6 skills: python, react". */
  matchReason?: string;
  deadlineLabel?: string;
  deadlineText?: string;
  category?: string;
};

export type JobCardProps = {
  job: JobSummary; selected?: boolean; saved?: boolean; applied?: boolean;
  density?: CardDensity; onSelect: () => void; onToggleSave?: () => void;
  action?: ReactNode;
  showMatch?: boolean;
  metadata?: { label: string; value: string }[];
  officialUrl?: string | null;
  disabled?: boolean;
};

/** Rounded opportunity card. The save control stays separate from the full-card selection target. */
export function JobCard({ job, selected = false, saved = false, applied = false, density = "comfortable", onSelect, onToggleSave, action, showMatch, metadata, officialUrl, disabled = false }: JobCardProps) {
  const compact = density === "compact";
  return (
    <article className={opportunityCardClasses(selected, density)}>
      <OpportunityCardContent job={job} density={density} applied={applied} showMatch={showMatch}
        heading={<h3><button type="button" disabled={disabled} onClick={onSelect} aria-pressed={selected} className={`min-h-11 w-full rounded-control py-0.5 text-left text-lg leading-snug tracking-tight after:absolute after:inset-0 after:rounded-card hover:text-accent sm:text-xl ${compact ? "card-title focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus" : "font-normal"}`}>{job.title}<span className="sr-only"> at {job.company}. View details</span></button></h3>}
        action={action ?? (onToggleSave ? <Button variant="ghost" size="sm" className="relative z-10 min-w-11 px-2" aria-label={`${saved ? "Unsave" : "Save"} ${job.title} at ${job.company}`} aria-pressed={saved} onClick={onToggleSave}><Icon name="bookmark" className={saved ? "fill-accent/20 text-accent" : "size-[1.125rem]"} /></Button> : undefined)}
      />
      {((metadata && metadata.length > 0) || officialUrl) && <div className={compact ? "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" : "contents"}>
        {metadata && metadata.length > 0 && <dl className={`metadata-text flex min-w-0 flex-wrap ${compact ? "gap-x-3 gap-y-1" : "mt-4 gap-x-4 gap-y-2"}`}>
          {metadata.map(({ label, value }) => <div key={label} className="flex flex-wrap gap-x-1">
            <dt>{label}</dt><dd className="text-foreground">{value}</dd>
          </div>)}
        </dl>}
        {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer"
          className={`relative z-10 inline-flex min-h-11 self-start items-center rounded-control text-sm text-accent underline underline-offset-4 ${compact ? "gap-1.5 px-2 focus-visible:outline-2 focus-visible:outline-focus" : "mt-3"}`}>
          Official source{compact && <Icon name="external-link" className="size-4" />}<span className="sr-only"> for {job.title} (opens in a new tab)</span>
        </a>}
      </div>}
    </article>
  );
}
