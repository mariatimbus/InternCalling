import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/account";
import { ApiError } from "@/lib/api/client";
import type { ReviewQueue } from "@/lib/review";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { decide } from "./actions";
export const metadata = { title: "Review | InternCalling" };
const postedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ReviewPage() {
  const { api, user } = await requireAccount();
  if (!user.reviewer) notFound();
  let queue: ReviewQueue;
  try { queue = await api.request<ReviewQueue>("/api/v1/review/opportunities"); }
  catch (error) { if (error instanceof ApiError && error.status === 403) notFound(); throw error; }

  return <div className="mx-auto max-w-4xl px-5 py-9 sm:px-8">
    <h1 className="page-title">Review</h1>
    <p className="reading-text mt-4">{queue.total
      ? `${queue.total} ${queue.total === 1 ? "posting" : "postings"} the filters could not decide on. Published ones appear in Jobs right away.`
      : "Postings the filters cannot decide on wait here."}</p>
    {queue.items.length ? <ul className="mt-7 space-y-4">
      {queue.items.map((item) => <li key={item.id} className="rounded-card border border-line bg-card p-6 [overflow-wrap:anywhere]">
        <p className="metadata-text">{[item.organization, item.location, item.posted_at && `Posted ${postedDate.format(new Date(item.posted_at))}`].filter(Boolean).join(" · ")}</p>
        <h2 className="card-title mt-2">{item.title}</h2>
        {item.review_reason && <p className="mt-2 text-sm text-muted">Held because: {item.review_reason}</p>}
        {item.description && <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-accent">Description</summary>
          <p className="reading-text mt-2 max-h-72 overflow-y-auto whitespace-pre-line">{item.description}</p>
        </details>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <form action={decide} className="contents">
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" name="decision" value="approve" size="sm">Publish</Button>
            <Button type="submit" name="decision" value="reject" variant="secondary" size="sm">Don&apos;t publish</Button>
          </form>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 px-1 text-sm text-accent underline">
            Open posting <Icon name="external-link" className="size-4" /><span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </li>)}
    </ul> : <div className="mt-7"><EmptyState title="Nothing to review" description="New postings that need a decision appear here after each ingestion run." /></div>}
  </div>;
}
