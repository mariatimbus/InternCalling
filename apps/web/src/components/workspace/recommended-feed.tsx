"use client";

import type { ComponentProps } from "react";
import { RecommendedJobs, type RankedOpportunity } from "./recommended-jobs";
import { InfiniteScrollTrigger, useInfiniteList, type InfinitePage, type Pagination } from "@/components/jobs/infinite-scroll";

const opportunityId = (item: RankedOpportunity) => item.opportunity.id;

export function RecommendedFeed({ items, pagination, loadMore, ...props }: ComponentProps<typeof RecommendedJobs> & {
  pagination?: Pagination;
  loadMore?: (page: number) => Promise<InfinitePage<RankedOpportunity>>;
}) {
  const feed = useInfiniteList(items, pagination, loadMore, opportunityId);
  const statuses = new Map(props.applications?.map((row) => [row.opportunity_id, row.status]));
  return <RecommendedJobs {...props}
    items={feed.items.map((item) => ({ ...item, status: statuses.get(item.opportunity.id) ?? item.status }))}
    listFooter={<InfiniteScrollTrigger {...feed} />} />;
}
