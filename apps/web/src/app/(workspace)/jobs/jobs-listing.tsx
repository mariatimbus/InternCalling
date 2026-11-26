import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Application, RecommendationPage } from "@/lib/api/types";
import type { RankedOpportunity } from "@/components/workspace/recommended-jobs";
import { RecommendedFeed } from "@/components/workspace/recommended-feed";
import { JobsSearch } from "@/components/jobs/jobs-search";
import { SortSelect } from "@/components/jobs/sort-select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { jobsParams, jobsPath, readJobsQuery, recommendationParams, type JobsKind, type JobsQuery, type JobsView } from "@/lib/jobs-url";
import { saveOpportunity } from "./save-action";
import { loadOpportunityAssessment, loadOpportunityCatalog } from "./assessment-action";
import { opportunityCopilotEnabled } from "@/lib/feature-flags";
import { readProfileSkills } from "@/lib/profile-skills";
import { savedSearchAction } from "./saved-search-actions";
import { SavedSearches } from "@/components/jobs/saved-searches";
import type { SavedSearch } from "@/lib/saved-searches";
import { loadMoreRecommended } from "./load-more-action";

const views = {
  recommended: { label: "Recommended", empty: "No opportunities found", help: "Try another search or come back later for new opportunities.", error: "Recommended opportunities could not be loaded." },
  saved: { label: "Saved", empty: "No saved opportunities yet", help: "Save an opportunity from Recommended to find it here.", error: "Saved opportunities could not be loaded." },
  applied: { label: "Applied", empty: "No applications yet", help: "Tracked applications appear here as they progress.", error: "Applied opportunities could not be loaded." },
} as const;
const copyFor = {
  internship: { title: "Find your next step.", intro: "Find internships and track your applications." },
  early_career: { title: "Early careers", intro: "Insight weeks, discovery days, ambassador and student programmes: a first look inside a company, often before you can apply for an internship." },
} as const;

/** Jobs (internships) and Early careers share one page; ``kind`` picks the list. */
export async function JobsListing({ searchParams, kind }: { searchParams: Promise<JobsQuery>; kind: JobsKind }) {
  const basePath = jobsPath(kind);
  const early = kind === "early_career";
  const { api } = await requireCompletedAccount();
  const query = readJobsQuery(await searchParams);
  // Saved and Applied live on Jobs; Early careers is one ranked list.
  const state = early ? { ...query, view: "recommended" as const } : query;
  const { view, search, location, degree, year, workModel, schedule, field, postedWithin, noExperience, sort, page } = state;
  const copilotEnabled = opportunityCopilotEnabled();

  function urlParams(target: JobsView, next: number) {
    return jobsParams({ ...state, view: target, page: next });
  }

  function href(target: JobsView, next = page) {
    return basePath + "?" + urlParams(target, next);
  }

  const params = recommendationParams(state, state.page, kind);
  const [tracker, catalog, profileSkills, savedSearches] = await Promise.allSettled([
    api.request<{ items: Application[]; total: number }>("/api/v1/applications"),
    view === "recommended" ? api.request<RecommendationPage>("/api/v1/opportunities/recommended?" + params) : null,
    copilotEnabled ? readProfileSkills(api) : null,
    view === "recommended" ? api.request<{ items: SavedSearch[] }>("/api/v1/saved-searches") : null,
  ]);
  // Saved searches are a convenience: if they fail to load, Jobs still works.
  const saved = savedSearches.status === "fulfilled" ? savedSearches.value?.items ?? [] : [];

  let items: RankedOpportunity[] = [];
  const result = catalog.status === "fulfilled" ? catalog.value : null;
  const failed = tracker.status === "rejected" || catalog.status === "rejected";
  if (tracker.status === "fulfilled" && !failed) {
    if (result) {
      const statuses = new Map(tracker.value.items.map((row) => [row.opportunity_id, row.status]));
      items = result.items.map((item) => ({
        ...item, status: statuses.get(item.opportunity.id),
      }));
    } else {
      items = tracker.value.items
        .filter((row) => (row.status === "saved") === (view === "saved"))
        .map(({ opportunity, status }) => ({ opportunity, status, match: null }));
    }
  }
  const copy = views[view];
  const listHeader = <>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1 className="page-title">{copyFor[kind].title}</h1>
        <p className="reading-text mt-3 max-w-2xl">{copyFor[kind].intro}</p>
      </div>
      <Link href="/profile" className="text-sm text-accent underline underline-offset-4">Your profile</Link>
    </div>
    {view === "recommended" && <div className="mt-6">
      <JobsSearch search={search} applied={{ location, degree_level: degree, study_year: year, work_model: workModel, schedule, field, posted_within: postedWithin, no_experience: noExperience }} navigationKey={href(view)} basePath={basePath} />
      {!early && <SavedSearches saved={saved} current={{ search, location, degree, year }} action={savedSearchAction} />}
    </div>}
    {!early && <nav aria-label="Job lists" className={`segmented-track mb-5 ${view === "recommended" ? "" : "mt-6"}`}>
      {(Object.keys(views) as JobsView[]).map((target) => <Link key={target} href={href(target)} prefetch={false}
        aria-current={target === view ? "page" : undefined}
        className="segmented-link">
        {views[target].label}
      </Link>)}
    </nav>}
      {!failed && <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {result?.total ?? items.length} {(result?.total ?? items.length) === 1 ? "opportunity" : "opportunities"}
        </p>
        {result && <p className="metadata-text">{sort === "recent" ? "Newest first." : sort === "deadline" ? "Closing soonest first." : sort === "company" ? "By company name." : "Ranked across all matching opportunities."}</p>}
        {result && <SortSelect sort={sort} params={urlParams(view, 1).toString()} basePath={basePath} />}
      </div>}
  </>;
  return <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
    {failed ? <>{listHeader}<ErrorState title={copy.error} action={<form action={basePath}>
      {Array.from(urlParams(view, page), ([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <Button type="submit">Try again</Button>
    </form>} /></> : items.length ? <RecommendedFeed key={href(view)} items={items} copilotEnabled={copilotEnabled}
        pagination={result ? { page: result.page ?? page, pageSize: result.page_size, total: result.total } : undefined}
        loadMore={view === "recommended" ? loadMoreRecommended.bind(null, Object.fromEntries(urlParams(view, page)), kind) : undefined}
        profileSkills={profileSkills.status === "fulfilled" ? profileSkills.value : null}
        detailContext={urlParams(view, page).toString()} label={copy.label + " opportunities"}
        loadAssessment={loadOpportunityAssessment} loadCatalog={loadOpportunityCatalog}
        saveAction={view === "recommended" ? saveOpportunity : undefined}
        applications={tracker.status === "fulfilled" ? tracker.value.items : []}>{listHeader}</RecommendedFeed>
        : <>{listHeader}<EmptyState title={copy.empty} description={copy.help} /></>}
  </div>;
}

