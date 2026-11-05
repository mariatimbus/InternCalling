import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { MatchScore } from "./match-score";
import { CompanyMark } from "./company-mark";
import { EligibilityBadge } from "./eligibility-badge";
import type { JobSummary } from "./job-card";

export type JobDetail = JobSummary & { description: string; responsibilities: readonly string[]; requirements: readonly string[]; deadlineLabel: string };
export type DetailPanelProps = { job: JobDetail; actions?: ReactNode; headingId?: string };

/** A readable job brief shared by the desktop pane and mobile drawer. */
export function DetailPanel({ job, actions, headingId }: DetailPanelProps) {
  return (
    <article aria-label={`${job.title} details`} className="mx-auto max-w-3xl p-1 sm:p-3 xl:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><CompanyMark initials={job.initials} /><div><p className="text-sm font-semibold">{job.company}</p><p className="mt-1 text-xs text-muted">Internship</p></div></div>
        <MatchScore score={job.matchScore} />
      </div>
      <h2 id={headingId} className="mt-6 text-2xl leading-snug font-medium tracking-tight xl:text-[1.75rem]">{job.title}</h2>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Icon name="location" className="size-4" />{job.location}</p>
      {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
      <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 rounded-card bg-elevated/50 p-5 text-sm xl:grid-cols-3">
        <div><dt className="text-xs text-muted">Workplace</dt><dd className="mt-1.5 font-medium">{job.workMode}</dd></div>
        <div><dt className="text-xs text-muted">Duration</dt><dd className="mt-1.5 font-medium">{job.duration}</dd></div>
        <div className="col-span-2 xl:col-span-1"><dt className="text-xs text-muted">Compensation</dt><dd className="mt-1.5 font-medium">{job.compensation}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-5"><EligibilityBadge status={job.eligibility} /><span className="text-xs text-muted">Illustrative demo profile</span></div>
      <div className="space-y-7 py-7 text-sm leading-7">
        <section><h3 className="font-semibold text-foreground">About the internship</h3><p className="mt-2 max-w-prose text-muted">{job.description}</p></section>
        <section><h3 className="font-semibold text-foreground">What you will do</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-muted marker:text-accent/50">{job.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3 className="font-semibold text-foreground">What you will bring</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-muted marker:text-accent/50">{job.requirements.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3 className="font-semibold text-foreground">Skills</h3><div className="mt-3 flex flex-wrap gap-2">{job.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div></section>
      </div>
      <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">{job.deadlineLabel}</p>
    </article>
  );
}
