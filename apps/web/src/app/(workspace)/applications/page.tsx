import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Application } from "@/lib/api/types";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationControls } from "@/components/applications/application-controls";
import { PageHeading } from "@/components/ui/page-heading";
import { CompanyAvatar } from "@/components/jobs/company-avatar";
import { organizationLogo } from "@/lib/organization-logo";
export const metadata = { title: "Applications | InternCalling" };

const views = [
  { value: "all", label: "All", empty: "No applications yet" },
  { value: "saved", status: "saved", label: "Saved", empty: "No saved internships yet" },
  { value: "applied", label: "Applied and later", empty: "No applications yet" },
  { value: "applied-only", status: "applied", label: "Applied", empty: "No applications with Applied status" },
  { value: "interview", status: "interview", label: "Interview", empty: "No applications at the interview stage" },
  { value: "offer", status: "offer", label: "Offer", empty: "No offers yet" },
  { value: "rejected", status: "rejected", label: "Rejected", empty: "No rejected applications" },
] as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { api } = await requireCompletedAccount();
  const query = await searchParams;
  const view = views.find(({ value }) => value === query.view) ?? views[0];
  const { items: confirmed } = await api.request<{ items: Application[]; total: number }>("/api/v1/applications");
  const counts: Record<Application["status"], number> = { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
  for (const { status } of confirmed) counts[status] += 1;

  const items = confirmed.filter(({ status }) => {
    if ("status" in view) return status === view.status;
    return view.value === "all" || status !== "saved";
  });

  return <div className="workspace-page">
    <PageHeading title={view.value === "saved" ? "Saved internships" : "Applications"} description="Your saved roles and application progress." />
    <nav aria-label="Application lists" className="my-6 flex flex-wrap gap-2 rounded-card border border-line bg-surface p-2 text-sm">
      {views.map((filter) => <Link key={filter.value} href={`/applications?view=${filter.value}`}
        aria-current={view.value === filter.value ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-control px-3 py-2 ${view.value === filter.value ? "bg-primary/10 text-accent font-semibold" : "text-muted hover:bg-elevated hover:text-foreground"}`}>
        {filter.label}{"status" in filter && ` (${counts[filter.status]})`}
      </Link>)}
    </nav>
    {items.length ? <ul className="space-y-4">
      {items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-5 rounded-card border border-line bg-card p-4 sm:p-6">
        <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-4 [overflow-wrap:anywhere]">
          <CompanyAvatar companyName={item.opportunity.organization ?? undefined} initials={item.opportunity.organization?.slice(0, 2).toUpperCase()} logoUrl={organizationLogo(item.opportunity.organization)} size="sm" />
          <div className="min-w-0">
            <h2 className="card-title"><Link href={`/opportunities/${item.opportunity_id}`} prefetch={false} className="rounded-control hover:text-accent hover:underline">{item.opportunity.title}</Link></h2>
            <p className="metadata-text mt-1">{item.opportunity.organization}</p>
          </div>
        </div>
        <ApplicationControls key={item.updated_at} opportunityId={item.opportunity_id} application={item} />
      </li>)}
    </ul> : <EmptyState title={view.empty}
      description={confirmed.length ? "Choose another filter to see more tracked opportunities." : "Explore internships to find your next opportunity."}
      action={confirmed.length
        ? <Link href="/applications" className="text-accent underline">Show all applications</Link>
        : <Link href="/jobs" className="text-accent underline">Explore internships</Link>} />}
  </div>;
}
