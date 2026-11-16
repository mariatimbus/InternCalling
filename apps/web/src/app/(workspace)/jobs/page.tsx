import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Match, OpportunityPage } from "@/lib/api/types";
import { RecommendedJobs } from "@/components/workspace/recommended-jobs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { opportunityTypes, opportunityTypeLabel } from "@/lib/opportunities";

export const metadata = { title: "Recommended opportunities | InternCalling" };
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { api } = await requireCompletedAccount();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const type = typeof query.type === "string" && opportunityTypes.some((value) => value === query.type) ? query.type : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const params = new URLSearchParams({ is_active: "true", page: String(page), page_size: "12" });
  if (type) params.set("opportunity_type", type);
  if (search.trim()) params.set("search", search.trim());
  const result = await api.request<OpportunityPage>(`/api/v1/opportunities?${params}`);
  const matches = await Promise.allSettled(result.items.map((job) => api.request<Match>(`/api/v1/opportunities/${encodeURIComponent(job.id)}/match`)));
  const items = result.items.map((opportunity, index) => ({ opportunity, match: matches[index].status === "fulfilled" ? matches[index].value : null })).sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  function href(next: number) { return `/jobs?${new URLSearchParams({ q: search, type, page: String(next) })}`; }
  return <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><h1 className="text-3xl tracking-tight">Find your next step.</h1><p className="mt-3 text-sm text-muted">Opportunities, matched to your profile.</p></div><Link href="/profile" className="text-sm text-accent underline underline-offset-4">Your profile</Link></div>
    <nav aria-label="Job lists" className="my-7 flex flex-wrap gap-2 text-sm"><Link href="/jobs" aria-current="page" className="rounded-full bg-elevated px-5 py-3">Recommended</Link><Link href="/applications?view=saved" className="rounded-full px-5 py-3 text-muted hover:bg-surface">Liked / Saved</Link><Link href="/applications?view=applied" className="rounded-full px-5 py-3 text-muted hover:bg-surface">Applied</Link></nav>
    <form action="/jobs" className="mb-7 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]"><Input label="Search opportunities" name="q" type="search" maxLength={200} defaultValue={search} wrapperClassName="min-w-0 flex-1" /><Select label="Opportunity type" name="type" defaultValue={type}><option value="">All opportunities</option>{opportunityTypes.map((value) => <option key={value} value={value}>{opportunityTypeLabel(value)}</option>)}</Select><Button type="submit">Search</Button></form>
    <p className="mb-5 text-xs leading-6 text-muted">{result.total} opportunities. Matches are ordered within this page of results.</p>
    <RecommendedJobs key={`${page}:${search}:${type}`} items={items} />
    <nav aria-label="Results pages" className="mt-7 flex justify-between text-sm text-accent">{page > 1 ? <Link href={href(page - 1)}>Previous page</Link> : <span />}{page * result.page_size < result.total && <Link href={href(page + 1)}>Next page</Link>}</nav>
  </div>;
}
