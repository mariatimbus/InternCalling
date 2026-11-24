"use client";

import type { Opportunity, OpportunityPage } from "@/lib/api/types";
import { PublicOpportunityCard } from "./public-opportunity-card";
import { InfiniteScrollTrigger, useInfiniteList } from "./infinite-scroll";

const opportunityId = (item: Opportunity) => item.id;

export function ExploreResults({ initial, loadMore }: {
  initial: OpportunityPage;
  loadMore: (page: number) => Promise<OpportunityPage>;
}) {
  const feed = useInfiniteList(initial.items, { page: initial.page, pageSize: initial.page_size, total: initial.total }, loadMore, opportunityId);
  return <>
    <div className="grid gap-3">
      {feed.items.map((job) => <PublicOpportunityCard key={job.id} opportunity={job} headingLevel="h2" />)}
    </div>
    <InfiniteScrollTrigger {...feed} />
  </>;
}
