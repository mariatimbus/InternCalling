import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Application } from "@/lib/api/types";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationControls } from "@/components/applications/application-controls";
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

  return <div className="mx-auto max-w-4xl px-5 py-9 sm:px-8">
    <h1 className="page-title">{view.value === "saved" ? "Saved internships" : "Applications"}</h1>
    <p className="reading-text mt-4">Your saved roles and application progress.</p>
    <nav aria-label="Application lists" className="my-7 flex flex-wrap gap-3 text-sm">
      {views.map((filter) => <Link key={filter.value} href={`/applications?view=${filter.value}`}
        aria-current={view.value === filter.value ? "page" : undefined}
        className={`rounded-control px-3 py-2 ${view.value === filter.value ? "bg-primary text-on-primary font-semibold" : "text-foreground hover:bg-surface"}`}>
        {filter.label}{"status" in filter && ` (${counts[filter.status]})`}
      </Link>)}
    </nav>
    {items.length ? <ul className="space-y-4">
      {items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-card p-6">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="metadata-text">{item.opportunity.organization}</p>
          <h2 className="card-title mt-2">{item.opportunity.title}</h2>
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
