import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
export const dynamic = "force-dynamic";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh"><header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7"><BrandLogo /><Link href="/" className="text-sm text-muted hover:text-foreground">Back to home</Link></header><main id="main-content" className="px-5 py-8 sm:py-14">{children}</main><footer className="px-6 pb-8 text-center text-xs text-muted">InternCalling · European tech internships</footer></div>;
}
