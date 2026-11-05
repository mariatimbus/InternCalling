import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-svh max-w-7xl flex-col px-6 sm:px-10 lg:px-14">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-5">
        <Link href="/" aria-label="InternCalling home" className="rounded-control"><BrandLogo /></Link>
        <nav aria-label="Main navigation" className="flex items-center gap-6 text-sm">
          <Link href="/" className="hidden min-h-11 items-center rounded-control text-muted hover:text-foreground sm:inline-flex">Home</Link>
          <Link href="/#how-it-works" className="hidden min-h-11 items-center rounded-control text-muted hover:text-foreground md:inline-flex">How it works</Link>
          <Link href="/preview/jobs" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover">Open workspace</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">{children}</main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-6 text-xs text-muted"><span>Made for students. Built around possibility.</span><span>InternCalling — European tech internships</span></footer>
    </div>
  );
}
