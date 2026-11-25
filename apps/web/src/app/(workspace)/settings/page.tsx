import { requireCompletedAccount } from "@/lib/auth/account";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
export const metadata = { title: "Account settings | InternCalling" };
export default async function SettingsPage() {
  const { user } = await requireCompletedAccount();
  return <div className="mx-auto max-w-3xl space-y-8 px-5 py-9 sm:px-8"><h1 className="page-title">Account settings</h1><section className="space-y-5 rounded-panel border border-line bg-card p-5 sm:p-7"><h2 className="section-title">Signed-in account</h2><p className="reading-text [overflow-wrap:anywhere]">{user.email}</p><SignOutButton /></section><ChangePasswordForm hasPassword={user.hasPassword} email={user.email} /></div>;
}
