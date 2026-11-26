import { JobsListing } from "./jobs-listing";
import type { JobsQuery } from "@/lib/jobs-url";

export const metadata = { title: "Jobs | InternCalling" };

export default function JobsPage({ searchParams }: { searchParams: Promise<JobsQuery> }) {
  return JobsListing({ searchParams, kind: "internship" });
}
