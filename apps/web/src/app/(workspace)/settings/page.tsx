import { requireCompletedAccount } from "@/lib/auth/account";
import { SignOutButton } from "@/components/auth/sign-out-button";
export const metadata = { title: "Account settings | InternCalling" };
export default async function SettingsPage() {
  const { user } = await requireCompletedAccount();
  return <div className="mx-auto max-w-3xl space-y-8 px-5 py-9 sm:px-8"><h1 className="text-3xl tracking-tight">Account settings</h1><section className="space-y-5 rounded-panel bg-card p-7"><h2 className="text-lg">Signed-in account</h2><p className="break-all text-sm text-muted">{user.email}</p><SignOutButton /></section></div>;
}
