import { requireAccount } from "@/lib/auth/account";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { ProfileHub } from "@/components/profile/profile-hub";
import { isSkillList } from "@/lib/profile-skills";
import { profileInsightsEnabled } from "@/lib/feature-flags";
import styles from "./profile-layout.module.css";

export const metadata = { title: "Your profile | InternCalling" };
export default async function ProfilePage() {
  const { profile, api, user } = await requireAccount();
  const selected = await api.request<unknown>("/api/v1/profile/skills").catch(() => null);
  return <div className={`mx-auto max-w-7xl px-5 py-7 sm:px-8 ${styles.workspace}`}>
    <div>
      <h1 className="page-title">Your profile</h1>
      <p className="reading-text mt-3">Your experience, studies and skills, in one place.</p>
    </div>
    <ProfileHub initialProfile={profile} initialSkills={isSkillList(selected) ? selected : null} insightsEnabled={profileInsightsEnabled()}
      socialLinks={user.socialLinks}
      contactEmail={user?.email.includes("@") ? user.email : undefined}
      preferences={<PreferencesForm profile={profile} />} />
  </div>;
}
