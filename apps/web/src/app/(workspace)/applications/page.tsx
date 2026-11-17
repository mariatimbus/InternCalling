import { ApplicationControls } from "@/components/applications/application-controls";
import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Application } from "@/lib/api/types";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "Applications | InternCalling" };
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { api } = await requireCompletedAccount();
  const query = await searchParams;
  const view = query.view === "saved" ? "saved" : query.view === "applied" ? "applied" : "all";
  const data = await api.request<{ items: Application[]; total: number }>("/api/v1/applications");
  const items = data.items.filter((item) => view === "all" || (view === "saved" ? item.status === "saved" : item.status !== "saved"));
  return <div className="mx-auto max-w-4xl px-5 py-9 sm:px-8"><h1 className="text-3xl tracking-tight">{view === "saved" ? "Saved internships" : "Applications"}</h1><p className="mt-4 text-sm text-muted">{data.total} tracked opportunities. Your saved roles and application progress.</p><nav aria-label="Application lists" className="my-7 flex flex-wrap gap-5 text-sm">{([['all', 'All'], ['saved', 'Saved'], ['applied', 'Applied']] as const).map(([value, label]) => <Link key={value} href={`/applications?view=${value}`} aria-current={view === value ? "page" : undefined} className={view === value ? "text-foreground underline underline-offset-8" : "text-muted"}>{label}</Link>)}</nav>{items.length ? <ul className="space-y-4">{items.map((item) => <li key={item.id} className="space-y-5 rounded-card bg-card p-6"><div><p className="text-xs text-muted">{item.opportunity.organization}</p><h2 className="mt-2 text-lg">{item.opportunity.title}</h2></div><Badge>{item.status}</Badge><ApplicationControls key={`${item.id}:${item.updated_at}`} opportunityId={item.opportunity_id} application={item} /></li>)}</ul> : <EmptyState title={view === "saved" ? "No saved internships yet" : "No applications yet"} description="Explore internships to find your next opportunity." action={<Link href="/jobs" className="text-accent underline">Explore internships</Link>} />}</div>;
}
