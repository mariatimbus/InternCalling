import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { EligibilityStatus } from "./eligibility-badge";
import { OpportunityCardContent, opportunityCardClasses, type CardDensity } from "./opportunity-card-content";

/** Presentation model, independent of API response shapes. */
export type JobSummary = {
  id: string; title: string; company: string; initials: string; location: string; country: string;
  workMode: "Hybrid" | "Remote" | "On-site";
  duration: string; compensation: string; postedLabel: string; skills: readonly string[];
  matchScore: number | null; eligibility: EligibilityStatus;
  description?: string;
  deadlineLabel?: string;
  deadlineText?: string;
};

export type JobCardProps = {
  job: JobSummary; selected?: boolean; saved?: boolean; applied?: boolean;
  density?: CardDensity; onSelect: () => void; onToggleSave: () => void;
};

/** Rounded opportunity card. The save control stays separate from the full-card selection target. */
export function JobCard({ job, selected = false, saved = false, applied = false, density = "comfortable", onSelect, onToggleSave }: JobCardProps) {
  return (
    <article className={opportunityCardClasses(selected, density)}>
      <OpportunityCardContent job={job} density={density} applied={applied}
        heading={<h3><button type="button" onClick={onSelect} aria-pressed={selected} className="min-h-11 w-full rounded-control py-0.5 text-left text-lg leading-snug font-normal tracking-tight after:absolute after:inset-0 after:rounded-card hover:text-accent sm:text-xl">{job.title}<span className="sr-only"> at {job.company}. View details</span></button></h3>}
        action={<Button variant="ghost" size="sm" className="relative z-10 min-w-11 px-2" aria-label={`${saved ? "Unsave" : "Save"} ${job.title} at ${job.company}`} aria-pressed={saved} onClick={onToggleSave}><Icon name="bookmark" className={saved ? "fill-accent/20 text-accent" : "size-[1.125rem]"} /></Button>}
      />
    </article>
  );
}
