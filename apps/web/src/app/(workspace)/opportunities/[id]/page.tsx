import Link from "next/link";
import { OpportunityDeadline, OpportunityFacts, OpportunitySource } from "@/components/jobs/opportunity-details";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api/client";
import type { Opportunity } from "@/lib/api/types";
import { requireCompletedAccount } from "@/lib/auth/account";
import { detailReturnParams, type JobsQuery } from "@/lib/jobs-url";

export const metadata = { title: "Opportunity details | InternCalling" };

export default async function OpportunityPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<JobsQuery>;
}) {
  const { api } = await requireCompletedAccount();
  const { id } = await params;
  const context = detailReturnParams(await searchParams);
  const jobsHref = context.size ? "/jobs?" + context : "/jobs";
  const path = "/opportunities/" + encodeURIComponent(id);
  let job: Opportunity | undefined;
  let failed = false;

  if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    try {
      job = await api.request<Opportunity>("/api/v1" + path, { authentication: "none" });
      if (!job) failed = true;
    } catch (error) {
      failed = !(error instanceof ApiError && (error.status === 404 || error.status === 422));
    }
  }

  return <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-8 sm:px-8">
    <Link href={jobsHref} className="inline-flex min-h-11 items-center rounded-control text-sm text-accent underline underline-offset-4">
      Back to Jobs
    </Link>
    {failed ? <ErrorState title="Opportunity details could not be loaded"
      description="Check your connection and try again."
      action={<form action={path}>
        {Array.from(context, ([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
        <Button type="submit">Try again</Button>
      </form>} />
      : job ? <article className="space-y-7 rounded-panel border border-line bg-card px-5 py-7 sm:px-8">
        <header className="space-y-3">
          <h1 className="page-title">{job.title}</h1>
          {job.organization && <p className="reading-text break-words">{job.organization}</p>}
          {job.location && <p className="metadata-text break-words">{job.location}</p>}
          {!job.is_active && <p className="text-sm font-medium">Closed on InternCalling</p>}
          <OpportunityDeadline value={job.deadline} />
          <OpportunitySource opportunity={job} />
        </header>
        <OpportunityFacts opportunity={job} />
      </article>
      : <div className="rounded-panel bg-surface p-6">
        <h1 className="section-title">Opportunity not found</h1>
        <p className="mt-2 text-sm text-muted">The opportunity may have been removed. Any history still supplied by the tracker remains in Saved or Applied.</p>
      </div>}
  </div>;
}
