import type { Opportunity } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

export function safeJobSource(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export const degreeLabels = { bachelor: "Bachelor’s", master: "Master’s", both: "Bachelor’s or master’s" } as const;

export function studyYears(value: Opportunity["study_year"]) {
  return value?.filter((year) => Number.isInteger(year) && year >= 1 && year <= 6).join(", ");
}

/** Present the recorded calendar date without interpreting it as a closing instant. */
export function OpportunityDeadline({ value }: { value: string | null | undefined }) {
  const date = value?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0];
  if (!date) return null;
  return <p className="metadata-text">Deadline: <time dateTime={date}>{date}</time></p>;
}

export function OpportunitySource({ opportunity }: { opportunity: Opportunity }) {
  const url = safeJobSource(opportunity.url);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer"
    className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm text-on-primary hover:bg-primary-hover">
    {opportunity.is_active ? "View original opportunity" : "View official listing"}
    <span className="sr-only"> (opens in a new tab)</span>
  </a>;
}

export function OpportunityFacts({ opportunity, compact = false }: { opportunity: Opportunity; compact?: boolean }) {
  const degree = opportunity.degree_level && degreeLabels[opportunity.degree_level];
  const years = studyYears(opportunity.study_year);
  const Heading = compact ? "h3" : "h2";
  return <>
    {opportunity.description && <section>
      <Heading className="section-title">About the opportunity</Heading>
      <p className="reading-text mt-3 whitespace-pre-line break-words">{opportunity.description}</p>
    </section>}
    {opportunity.skills.length > 0 && <section>
      <Heading className="section-title mb-3">Skills</Heading>
      <div className="flex flex-wrap gap-2">{opportunity.skills.map((skill) => <Badge key={skill.id}>{skill.name}</Badge>)}</div>
    </section>}
    {(degree || years) && <section>
      <Heading className="section-title mb-3">Education requirements</Heading>
      <dl className="space-y-2 text-sm">
        {degree && <div><dt className="inline text-muted">Degree level</dt> <dd className="inline">{degree}</dd></div>}
        {years && <div><dt className="inline text-muted">Study year</dt> <dd className="inline">{years}</dd></div>}
      </dl>
    </section>}
  </>;
}
