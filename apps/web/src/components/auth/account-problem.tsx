import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SignOutButton } from "./sign-out-button";
export function AccountProblem({ message = "We could not verify your account. Check your connection and try again." }: { message?: string }) {
  return <main id="main-content" className="mx-auto max-w-xl space-y-6 px-6 py-16"><BrandLogo /><h1 className="text-3xl">Your workspace is temporarily unavailable.</h1><p className="leading-7 text-muted">{message}</p><div className="flex flex-wrap items-center gap-5"><a href="" className="text-accent underline">Try again</a><Link href="/sign-in" className="text-accent underline">Sign in</Link><SignOutButton /></div></main>;
}
