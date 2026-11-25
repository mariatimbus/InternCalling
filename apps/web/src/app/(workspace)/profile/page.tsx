import { requireAccount } from "@/lib/auth/account";
import { ProfileHub } from "@/components/profile/profile-hub";
import { isSkillList } from "@/lib/profile-skills";
import { profileInsightsEnabled } from "@/lib/feature-flags";
import styles from "./profile-layout.module.css";

export const metadata = { title: "Your profile | InternCalling" };
export default async function ProfilePage() {
  const { profile, api, user } = await requireAccount();
  const selected = await api.request<unknown>("/api/v1/profile/skills").catch(() => null);
  return <div className={`workspace-page ${styles.workspace}`}>
    <div>
      <h1 className="page-title">Your profile</h1>
      <p className="page-description">Your experience, studies and skills, in one place.</p>
    </div>
    <ProfileHub initialProfile={profile} initialSkills={isSkillList(selected) ? selected : null} insightsEnabled={profileInsightsEnabled()}
      socialLinks={user.socialLinks}
      contactEmail={user?.email.includes("@") ? user.email : undefined} />
  </div>;
}
