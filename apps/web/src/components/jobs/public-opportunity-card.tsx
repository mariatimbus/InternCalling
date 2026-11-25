import { OpportunityCardContent, opportunityCardClasses } from "./opportunity-card-content";
import type { Opportunity } from "@/lib/api/types";
import { officialOpportunityUrl, opportunitySummary } from "@/lib/opportunities";
import { companyLogoUrl } from "@/lib/company-logo";

export function PublicOpportunityCard({ opportunity, headingLevel: Heading = "h3" }: { opportunity: Opportunity; headingLevel?: "h2" | "h3" }) {
  const url = officialOpportunityUrl(opportunity.url);
  return <article className={opportunityCardClasses()}>
    <OpportunityCardContent job={{ ...opportunitySummary(opportunity), companyLogoUrl: companyLogoUrl(opportunity.company_domain, opportunity.source) }} showMatch={false} heading={<Heading className="card-title">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-control hover:text-accent">{opportunity.title}<span className="sr-only"> (opens the official source in a new tab)</span></a> : opportunity.title}</Heading>} />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-3">
    {(opportunity.degree_level || opportunity.deadline) && <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">{opportunity.degree_level && <div className="flex gap-2"><dt>Degree</dt><dd className="font-medium text-foreground">{opportunity.degree_level === "both" ? "Bachelor's or Master's" : opportunity.degree_level === "bachelor" ? "Bachelor's" : "Master's"}</dd></div>}{opportunity.deadline && <div className="flex gap-2"><dt>Deadline</dt><dd className="font-medium text-foreground">{new Date(opportunity.deadline).toLocaleDateString("en-GB", { timeZone: "UTC" })}</dd></div>}</dl>}
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex min-h-10 items-center self-start rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">View opportunity<span className="sr-only"> (opens the official source in a new tab)</span></a>}
    </div>
  </article>;
}
