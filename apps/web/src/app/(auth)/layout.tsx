import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Icon } from "@/components/ui/icon";
export const dynamic = "force-dynamic";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8"><BrandLogo /><Link href="/" className="inline-flex min-h-11 items-center rounded-control text-sm text-muted hover:text-foreground">Back to home</Link></header>
    <main id="main-content" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-5 pb-10 sm:px-8 sm:py-12 lg:grid-cols-2">
      <aside className="hidden max-w-md lg:block">
        <h2 className="text-4xl font-bold leading-tight tracking-tight text-foreground">A clearer path to<br />your first role.</h2>
        <p className="mt-5 text-base leading-relaxed text-muted">Explore European tech internships, understand how they fit your studies and keep your next steps in one place.</p>
        <Link href="/explore" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-control text-sm font-semibold text-accent hover:underline">Explore opportunities<Icon name="arrow" className="size-4" /></Link>
      </aside>
      {children}
    </main>
    <footer className="px-6 pb-8 text-center text-xs text-muted">InternCalling · European tech internships</footer>
  </div>;
}
