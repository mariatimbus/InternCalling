import { requireAccount } from "@/lib/auth/account";
import { ProfileHub } from "@/components/profile/profile-hub";
import { isSkillList } from "@/lib/profile-skills";

export const metadata = { title: "Your profile | InternCalling" };
export default async function ProfilePage() {
  const { profile, api } = await requireAccount();
  const selected = await api.request<unknown>("/api/v1/profile/skills").catch(() => null);
  return <div className="mx-auto max-w-3xl px-5 py-9 sm:px-8">
    <h1 className="text-3xl tracking-tight">Your profile</h1>
    <p className="mt-4 text-sm leading-7 text-muted">Your introduction, studies and location.</p>
    <ProfileHub initialProfile={profile} initialSkills={isSkillList(selected) ? selected : null} />
  </div>;
}
