import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";

export default async function MissingOpportunityId() {
  await requireCompletedAccount();
  return <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-8 sm:px-8">
    <Link href="/jobs" className="inline-flex min-h-11 items-center rounded-control text-sm text-accent underline underline-offset-4">Back to Jobs</Link>
    <div className="rounded-panel bg-surface p-6">
      <h1 className="section-title">Opportunity not found</h1>
      <p className="reading-text mt-2">This link is missing an opportunity ID.</p>
    </div>
  </div>;
}
