import { requireCompletedAccount } from "@/lib/auth/account";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PageHeading } from "@/components/ui/page-heading";
import { Icon } from "@/components/ui/icon";
export const metadata = { title: "Account settings | InternCalling" };
export default async function SettingsPage() {
  const { user } = await requireCompletedAccount();
  return <div className="workspace-page space-y-6">
    <PageHeading title="Account settings" description="Manage your account and keep your sign-in details secure." />
    <div className="max-w-3xl space-y-6">
      <section className="space-y-5 rounded-panel border border-line bg-card p-5 sm:p-7">
        <h2 className="section-title flex items-center gap-2.5"><Icon name="profile" className="text-accent" />Signed-in account</h2>
        <p className="reading-text [overflow-wrap:anywhere]">{user.email}</p><SignOutButton />
      </section>
      <ChangePasswordForm hasPassword={user.hasPassword} email={user.email} />
    </div>
  </div>;
}
