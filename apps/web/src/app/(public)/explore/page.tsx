import Link from "next/link";
import { getPublicCatalog } from "@/lib/api/catalog";
import { opportunityTypes, opportunityTypeLabel } from "@/lib/opportunities";
import { ExploreResults } from "@/components/jobs/explore-results";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { loadExplorePage } from "./load-more-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore opportunities | InternCalling" };
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const type = typeof query.type === "string" && opportunityTypes.some((value) => value === query.type) ? query.type : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(10000, Math.max(1, Number(query.page))) : 1;
  const result = await getPublicCatalog({ search, type, page }).catch(() => null);
  return <div className="py-7 sm:py-10"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="page-title">Find your next opportunity.</h1><p className="reading-text mt-3 max-w-2xl">Internships, research and early career roles. Find a place to start.</p></div><Link href="/jobs" className="inline-flex min-h-10 items-center text-sm font-medium text-accent underline underline-offset-4">Find my matches</Link></div>
    <form action="/explore" className="my-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[1fr_auto_auto]"><Input label="Search opportunities" name="q" type="search" placeholder="Role, company or skill" maxLength={200} defaultValue={search} wrapperClassName="col-span-2 sm:col-span-1" /><Select label="Opportunity type" name="type" defaultValue={type}><option value="">All opportunities</option>{opportunityTypes.map((value) => <option key={value} value={value}>{opportunityTypeLabel(value)}</option>)}</Select><Button type="submit">Search</Button></form>
    {result ? <><p className="mb-6 text-sm text-muted">{result.total} opportunities</p>{result.items.length ? <ExploreResults key={JSON.stringify([search, type, page])} initial={result} loadMore={loadExplorePage.bind(null, { search, type })} /> : <EmptyState title="No opportunities found" description="Try another search or opportunity type." action={<Link href="/explore" className="text-accent underline">Clear filters</Link>} />}</> : <ErrorState title="Opportunities could not be loaded" description="Check your connection and try again shortly." action={<Link href="/explore" className="text-accent underline">Try again</Link>} />}
  </div>;
}
