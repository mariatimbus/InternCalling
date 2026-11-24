import { requireAccount } from "@/lib/auth/account";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { ProfileHub } from "@/components/profile/profile-hub";
import { isSkillList } from "@/lib/profile-skills";
import { profileInsightsEnabled } from "@/lib/feature-flags";
import styles from "./profile-layout.module.css";

export const metadata = { title: "Your profile | InternCalling" };
export default async function ProfilePage() {
  const { profile, api } = await requireAccount();
  const selected = await api.request<unknown>("/api/v1/profile/skills").catch(() => null);
  return <div className={`mx-auto max-w-3xl px-5 py-9 sm:px-8 xl:flex xl:h-full xl:max-w-7xl xl:flex-col xl:pt-5 xl:pb-0 ${styles.workspace}`}>
    <div className="shrink-0">
      <h1 className="page-title">Your profile</h1>
      <p className="reading-text mt-4">Your introduction, studies and location.</p>
    </div>
    <ProfileHub initialProfile={profile} initialSkills={isSkillList(selected) ? selected : null} insightsEnabled={profileInsightsEnabled()}
      preferences={<PreferencesForm profile={profile} />} />
  </div>;
}
