import { OpportunityCardContent, opportunityCardClasses } from "./opportunity-card-content";
import type { Opportunity } from "@/lib/api/types";
import { officialOpportunityUrl, opportunitySummary } from "@/lib/opportunities";

export function PublicOpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const url = officialOpportunityUrl(opportunity.url);
  return <article className={opportunityCardClasses()}>
    <OpportunityCardContent job={opportunitySummary(opportunity)} showMatch={false} heading={<h3 className="text-xl leading-snug tracking-tight">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-control hover:text-accent">{opportunity.title}<span className="sr-only"> (opens the official source in a new tab)</span></a> : opportunity.title}</h3>} />
    {(opportunity.degree_level || opportunity.deadline) && <dl className="mt-5 grid gap-3 text-xs text-muted sm:grid-cols-2">{opportunity.degree_level && <div><dt>Degree level</dt><dd className="mt-1 text-foreground">{opportunity.degree_level === "both" ? "Bachelor's or Master's" : opportunity.degree_level === "bachelor" ? "Bachelor's" : "Master's"}</dd></div>}{opportunity.deadline && <div><dt>Application deadline</dt><dd className="mt-1 text-foreground">{new Date(opportunity.deadline).toLocaleDateString("en-GB", { timeZone: "UTC" })}</dd></div>}</dl>}
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex min-h-11 items-center self-start rounded-full border border-border px-5 text-sm text-accent hover:bg-elevated">View official opportunity<span className="sr-only"> (opens in a new tab)</span></a>}
  </article>;
}
