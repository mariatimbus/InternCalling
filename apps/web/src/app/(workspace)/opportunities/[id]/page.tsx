import Link from "next/link";
import { OpportunityDetailView } from "@/components/jobs/opportunity-detail-view";
import { StandaloneOpportunitySave } from "@/components/workspace/recommended-jobs";
import { saveOpportunity } from "@/app/(workspace)/jobs/save-action";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api/client";
import type { Application, Opportunity } from "@/lib/api/types";
import { readOpportunityAssessment } from "@/lib/api/opportunity-assessment";
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
  const [assessment, tracker] = job ? await Promise.all([
    readOpportunityAssessment(api, id),
    api.request<{ items: Application[] }>("/api/v1/applications").catch(() => null),
  ]) : [null, null];
  const trackerItems = Array.isArray(tracker?.items) ? tracker.items : null;
  const status = trackerItems?.find((row) => row.opportunity_id === id)?.status;
  const canSave = job?.is_active === true && trackerItems !== null && !status;

  return <div className={`mx-auto w-full max-w-4xl px-5 py-4 sm:px-8 ${job ? "flex h-full min-h-64 flex-col gap-3" : "space-y-5"}`}>
    <Link href={jobsHref} className="inline-flex min-h-11 shrink-0 items-center self-start rounded-control text-sm text-accent underline underline-offset-4">
      Back to Jobs
    </Link>
    {failed ? <ErrorState title="Opportunity details could not be loaded"
      description="Check your connection and try again."
      action={<form action={path}>
        {Array.from(context, ([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
        <Button type="submit">Try again</Button>
      </form>} />
      : job ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-card">
        <OpportunityDetailView opportunity={job} assessment={assessment} standalone
          saveControl={status || canSave
            ? <StandaloneOpportunitySave key={id} id={id} title={job.title} status={status} saveAction={canSave ? saveOpportunity : undefined} />
            : job.is_active && trackerItems === null
              ? <p role="status" className="metadata-text">Save unavailable. Reload to try again.</p>
              : undefined} />
      </div>
      : <div className="rounded-panel bg-surface p-6">
        <h1 className="section-title">Opportunity not found</h1>
        <p className="mt-2 text-sm text-muted">The opportunity may have been removed. Any history still supplied by the tracker remains in Saved or Applied.</p>
      </div>}
  </div>;
}
