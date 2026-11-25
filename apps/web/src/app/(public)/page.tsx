import Link from "next/link";
import { PublicOpportunityCard } from "@/components/jobs/public-opportunity-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { getPublicCatalog } from "@/lib/api/catalog";
import { Icon, type IconName } from "@/components/ui/icon";
export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getPublicCatalog({ pageSize: 6 }).then((data) => ({ data, failed: false })).catch(() => ({ data: null, failed: true }));
  return (
    <div>
      <section className="grid items-center gap-10 pt-12 pb-12 sm:pt-16 sm:pb-16 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)] lg:gap-16">
        <div>
          <h1 className="display-title max-w-3xl">Find your first role in <span className="display-accent">European tech.</span></h1>
          <p className="reading-text mt-5 max-w-xl text-muted sm:text-lg">Explore internships, understand the requirements and find the opportunities you want to keep coming back to.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href="/explore" className="inline-flex min-h-12 items-center gap-3 rounded-control bg-primary px-5 py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover">Explore opportunities<Icon name="arrow" className="size-4" /></Link>
            <Link href="/sign-up" className="inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-accent hover:underline">Create an account</Link>
          </div>
        </div>
        <section id="how-it-works" aria-labelledby="how-heading" className="rounded-panel border border-line bg-surface p-6 sm:p-7">
          <h2 id="how-heading" className="section-title">A little more clarity for your next step.</h2>
          <div className="mt-6 space-y-5">
            {([{ icon: "search", title: "Explore", description: "Browse opportunities and open the original employer or organizer page." }, { icon: "profile", title: "Build your profile", description: "Add your studies, location and skills to personalize your matches." }, { icon: "check", title: "Review the details", description: "Check the official requirements and application instructions before applying." }] satisfies { icon: IconName; title: string; description: string }[]).map((item) => <article key={item.title} className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-accent"><Icon name={item.icon} className="size-[1.125rem]" /></span>
              <div><h3 className="text-sm font-semibold text-foreground">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p></div>
            </article>)}
          </div>
        </section>
      </section>
      <section aria-labelledby="opportunities-heading" className="pb-16 sm:pb-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><h2 id="opportunities-heading" className="section-title">Opportunities to explore</h2>{catalog.data && <Link href="/explore" className="text-sm text-accent">View all {catalog.data.total} opportunities</Link>}</div>
        <div className="grid items-stretch gap-3">
          {catalog.data?.items.map((job) => <PublicOpportunityCard key={job.id} opportunity={job} />)}
        </div>
        {catalog.failed && <ErrorState title="Opportunities could not be loaded" description="Please try again shortly." />}
        {catalog.data?.items.length === 0 && <EmptyState title="No opportunities available yet" description="New opportunities will appear here once published." />}
      </section>
      <p className="my-8 max-w-3xl text-xs leading-relaxed text-muted">Applications take place on the official source website. Availability and requirements can change; check the original posting before applying.</p>
    </div>
  );
}
