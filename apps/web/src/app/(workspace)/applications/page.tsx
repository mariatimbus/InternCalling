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
  return <div className="mx-auto max-w-4xl px-5 py-9 sm:px-8"><h1 className="page-title">{view === "saved" ? "Saved internships" : "Applications"}</h1><p className="reading-text mt-4">Your saved roles and application progress.</p><nav aria-label="Application lists" className="my-7 flex flex-wrap gap-5 text-sm">{([['all', 'All'], ['saved', 'Saved'], ['applied', 'Applied']] as const).map(([value, label]) => <Link key={value} href={`/applications?view=${value}`} aria-current={view === value ? "page" : undefined} className={view === value ? "text-foreground underline underline-offset-8" : "text-muted"}>{label}</Link>)}</nav>{items.length ? <ul className="space-y-4">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-card p-6"><div className="min-w-0 [overflow-wrap:anywhere]"><p className="metadata-text">{item.opportunity.organization}</p><h2 className="card-title mt-2">{item.opportunity.title}</h2></div><Badge>{item.status}</Badge></li>)}</ul> : <EmptyState title={view === "saved" ? "No saved internships yet" : "No applications yet"} description="Explore internships to find your next opportunity." action={<Link href="/jobs" className="text-accent underline">Explore internships</Link>} />}</div>;
}
