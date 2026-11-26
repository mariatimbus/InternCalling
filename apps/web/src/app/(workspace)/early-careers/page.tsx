import { JobsListing } from "../jobs/jobs-listing";
import type { JobsQuery } from "@/lib/jobs-url";

export const metadata = { title: "Early careers | InternCalling" };

export default function EarlyCareersPage({ searchParams }: { searchParams: Promise<JobsQuery> }) {
  return JobsListing({ searchParams, kind: "early_career" });
}
