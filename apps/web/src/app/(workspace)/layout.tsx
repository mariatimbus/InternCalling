import { redirect } from "next/navigation";
import { getAccountState } from "@/lib/auth/account";
import { AppShell } from "@/components/layout/app-shell";
import { AuthBoundary } from "@/components/auth/auth-boundary";
import { AccountProblem } from "@/components/auth/account-problem";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { NavigationItem } from "@/components/navigation/sidebar";

const navigation: NavigationItem[] = [
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/profile", label: "Resume / Profile", icon: "profile" },
  { href: "/applications", label: "Applications", icon: "applications" },
  { href: "/settings", label: "Account / Settings", icon: "settings" },
];
const reviewItem: NavigationItem = { href: "/review", label: "Review", icon: "check" };
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccountState();
  if (account.kind === "guest" || account.kind === "not-configured") redirect("/sign-in");
  if (account.kind !== "ready") return <AccountProblem message={account.kind === "profile-error" ? account.message : undefined} />;
  // Each data page enforces completion where required. Profile stays editable after nullable details are cleared.
  return <AuthBoundary config={account.config} userId={account.user.id}><AppShell navigation={account.user.reviewer ? [...navigation, reviewItem] : navigation} account={<div><p className="truncate text-xs text-muted" title={account.user.email}>{account.user.email}</p><SignOutButton /></div>}>{children}</AppShell></AuthBoundary>;
}
