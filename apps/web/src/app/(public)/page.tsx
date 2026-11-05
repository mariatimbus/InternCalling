import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { OpportunityCardContent, opportunityCardClasses } from "@/components/jobs/opportunity-card-content";
import { demoJobs } from "@/components/dev/demo-jobs";

export default function Home() {
  return (
    <div>
      <section className="grid items-end gap-8 pt-14 pb-10 sm:pt-20 sm:pb-14 lg:grid-cols-[1fr_auto]">
        <div><h1 className="max-w-3xl text-4xl leading-[1.12] font-normal tracking-tight sm:text-6xl">Find your first role in European tech.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">Explore internships, understand the requirements and find the opportunities you want to keep coming back to.</p></div>
        <div className="pb-1"><Link href="/preview/jobs" className="inline-flex min-h-12 items-center rounded-full bg-primary px-7 py-3 text-sm font-medium text-on-primary hover:bg-primary-hover">Open your workspace</Link><p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">An interactive preview. No account needed.</p></div>
      </section>
      <section aria-labelledby="opportunities-heading" className="pb-16 sm:pb-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><h2 id="opportunities-heading" className="text-lg font-medium">A few places to start</h2><span className="text-sm text-muted">{demoJobs.length} example internships</span></div>
        <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:gap-8">
          {demoJobs.map((job) => (
            <article key={job.id} className={opportunityCardClasses()}>
              <OpportunityCardContent job={job}
                heading={<h3><Link href={`/preview/jobs?job=${encodeURIComponent(job.id)}`} className="inline-block rounded-control text-xl leading-snug font-normal tracking-tight after:absolute after:inset-0 after:rounded-card hover:text-accent">{job.title}</Link></h3>}
                action={<span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-accent/8 text-accent"><Icon name="arrow" className="size-4 -rotate-45" /></span>}
              />
            </article>
          ))}
        </div>
      </section>
      <section id="how-it-works" aria-labelledby="how-heading" className="rounded-panel bg-surface/50 p-6 sm:p-10">
        <h2 id="how-heading" className="max-w-xl text-2xl leading-snug font-normal tracking-tight">A little more clarity for your next step.</h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {[{ icon: "search" as const, title: "Explore", description: "Search by title, company or skill. Choose the countries and workplaces that suit your plans." }, { icon: "bookmark" as const, title: "Keep a shortlist", description: "Save the roles you like and come back to the details when you are ready." }, { icon: "applications" as const, title: "Keep moving", description: "Bring your saved roles and applications together in the same workspace." }].map((item) => <article key={item.title}><Icon name={item.icon} className="mb-4 text-accent" /><h3 className="text-base font-medium">{item.title}</h3><p className="mt-3 text-sm leading-7 text-muted">{item.description}</p></article>)}
        </div>
      </section>
      <p className="my-8 max-w-3xl text-xs leading-relaxed text-muted">Welcome to InternCalling. Roles, matches and eligibility in this preview are fictional. Actions are not connected to an account or application service.</p>
    </div>
  );
}
