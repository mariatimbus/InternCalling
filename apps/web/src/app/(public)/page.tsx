import Link from "next/link";
import { PublicOpportunityCard } from "@/components/jobs/public-opportunity-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { getPublicCatalog } from "@/lib/api/catalog";
export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getPublicCatalog({ pageSize: 6 }).then((data) => ({ data, failed: false })).catch(() => ({ data: null, failed: true }));
  return (
    <div>
      <section className="grid items-end gap-8 pt-14 pb-10 sm:pt-20 sm:pb-14 lg:grid-cols-[1fr_auto]">
        <div><h1 className="display-title max-w-3xl">Find your first role in <span className="display-accent">European tech.</span></h1><p className="reading-text mt-6 max-w-2xl sm:text-lg">Explore internships, understand the requirements and find the opportunities you want to keep coming back to.</p></div>
        <div className="pb-1"><Link href="/explore" className="inline-flex min-h-12 items-center rounded-full bg-primary px-7 py-3 text-sm font-medium text-on-primary hover:bg-primary-hover">Explore opportunities</Link><p className="mt-3 max-w-xs text-xs leading-relaxed text-muted"><Link href="/sign-up" className="underline underline-offset-4">Create an account</Link> for matches based on your profile.</p></div>
      </section>
      <section aria-labelledby="opportunities-heading" className="pb-16 sm:pb-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><h2 id="opportunities-heading" className="section-title">Opportunities to explore</h2>{catalog.data && <Link href="/explore" className="text-sm text-accent">View all {catalog.data.total} opportunities</Link>}</div>
        <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:gap-8">
          {catalog.data?.items.map((job) => <PublicOpportunityCard key={job.id} opportunity={job} />)}
        </div>
        {catalog.failed && <ErrorState title="Opportunities could not be loaded" description="Please try again shortly." />}
        {catalog.data?.items.length === 0 && <EmptyState title="No opportunities available yet" description="New opportunities will appear here once published." />}
      </section>
      <section id="how-it-works" aria-labelledby="how-heading" className="rounded-panel bg-surface/50 p-6 sm:p-10">
        <h2 id="how-heading" className="section-title max-w-xl">A little more clarity for your next step.</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {[{ title: "Explore", description: "Browse opportunities and open the original employer or organizer page." }, { title: "Build your profile", description: "Add your studies, location and skills to personalize your matches." }, { title: "Review the details", description: "Check the official requirements and application instructions before applying." }].map((item) => <article key={item.title}><h3 className="card-title">{item.title}</h3><p className="reading-text mt-3">{item.description}</p></article>)}
        </div>
      </section>
      <p className="my-8 max-w-3xl text-xs leading-relaxed text-muted">Applications take place on the official source website. Availability and requirements can change; check the original posting before applying.</p>
    </div>
  );
}
