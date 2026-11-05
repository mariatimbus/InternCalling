import type { Metadata } from "next";
import type { NavigationItem } from "@/components/navigation/sidebar";
import { AppShell } from "@/components/layout/app-shell";
import { DemoWorkspaceProvider } from "@/components/dev/demo-workspace-provider";

export const metadata: Metadata = { title: "Workspace preview | InternCalling", robots: { index: false, follow: false } };

const navigation: readonly NavigationItem[] = [
  { href: "/preview/jobs", label: "Jobs", icon: "jobs" },
  { href: "/preview/profile", label: "Profile", icon: "profile" },
  { href: "/preview/applications", label: "Applications", icon: "applications" },
  { href: "/preview/settings", label: "Settings", icon: "settings" },
];

/** Public UI sandbox. A future authenticated server layout must verify the Supabase session before using AppShell. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navigation={navigation} notice={<><strong className="font-semibold">Workspace preview</strong> · Fictional data. Match and eligibility are examples. No account or API connected.</>}><DemoWorkspaceProvider>{children}</DemoWorkspaceProvider></AppShell>;
}
