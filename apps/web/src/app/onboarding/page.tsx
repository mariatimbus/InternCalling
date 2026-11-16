import { redirect } from "next/navigation";
import { getAccountState } from "@/lib/auth/account";
import { isProfileComplete } from "@/lib/onboarding";
import type { Skill } from "@/lib/api/types";
import { AccountProblem } from "@/components/auth/account-problem";
import { AuthBoundary } from "@/components/auth/auth-boundary";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata = { title: "Your profile | InternCalling", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await getAccountState();
  if (account.kind === "guest" || account.kind === "not-configured") redirect("/sign-in");
  if (account.kind !== "ready") return <AccountProblem message={account.kind === "profile-error" ? account.message : undefined} />;
  if (isProfileComplete(account.profile) && (await searchParams).edit !== "1") redirect("/jobs");
  const [own, catalog] = await Promise.allSettled([account.api.request<Skill[]>("/api/v1/profile/skills"), account.api.request<Skill[]>("/api/v1/skills")]);
  // Never replace a user's saved skills with an empty fallback after a failed read.
  if (own.status === "rejected") return <AccountProblem message="We could not load your skills. Try again before editing your profile." />;
  const profile = account.profile;
  return <AuthBoundary config={account.config} userId={account.user.id}><div className="min-h-dvh"><header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-6"><BrandLogo /><SignOutButton /></header><main id="main-content"><OnboardingFlow initial={{ degree_level: profile.degree_level ?? "", university: profile.university ?? "", field_of_study: profile.field_of_study ?? "", graduation_year: profile.graduation_year?.toString() ?? "", location: profile.location ?? "", skills: own.value.map((skill) => skill.name) }} suggestions={catalog.status === "fulfilled" ? catalog.value.map((skill) => skill.name) : []} /></main></div></AuthBoundary>;
}
