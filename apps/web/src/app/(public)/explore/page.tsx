import Link from "next/link";
import { getPublicCatalog } from "@/lib/api/catalog";
import { opportunityTypes, opportunityTypeLabel } from "@/lib/opportunities";
import { PublicOpportunityCard } from "@/components/jobs/public-opportunity-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore opportunities | InternCalling" };
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const type = typeof query.type === "string" && opportunityTypes.some((value) => value === query.type) ? query.type : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const result = await getPublicCatalog({ search, type, page }).catch(() => null);
  function href(next: number) { return `/explore?${new URLSearchParams({ q: search, type, page: String(next) })}`; }
  return <div className="py-10 sm:py-14"><div className="flex flex-wrap items-end justify-between gap-5"><div><h1 className="text-4xl tracking-tight sm:text-5xl">Explore your next step.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-muted">Browse published opportunities and follow the official links to read the requirements and apply.</p></div><Link href="/jobs" className="text-sm text-accent underline underline-offset-4">Find my matches</Link></div>
    <form action="/explore" className="my-8 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]"><Input label="Search opportunities" name="q" type="search" maxLength={200} defaultValue={search} /><Select label="Opportunity type" name="type" defaultValue={type}><option value="">All opportunities</option>{opportunityTypes.map((value) => <option key={value} value={value}>{opportunityTypeLabel(value)}</option>)}</Select><Button type="submit">Search</Button></form>
    {result ? <><p className="mb-6 text-sm text-muted">{result.total} opportunities</p>{result.items.length ? <div className="grid gap-6 md:grid-cols-2">{result.items.map((job) => <PublicOpportunityCard key={job.id} opportunity={job} />)}</div> : <EmptyState title="No opportunities found" description="Try another search or opportunity type." action={<Link href="/explore" className="text-accent underline">Clear filters</Link>} />}<nav aria-label="Results pages" className="mt-8 flex justify-between text-sm text-accent">{page > 1 ? <Link href={href(page - 1)}>Previous page</Link> : <span />}{page * result.page_size < result.total && <Link href={href(page + 1)}>Next page</Link>}</nav></> : <ErrorState title="Opportunities could not be loaded" description="Check your connection and try again shortly." action={<Link href="/explore" className="text-accent underline">Try again</Link>} />}
  </div>;
}
