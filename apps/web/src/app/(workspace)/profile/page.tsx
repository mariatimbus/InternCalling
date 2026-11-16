import Link from "next/link";
import { requireCompletedAccount } from "@/lib/auth/account";
import type { Skill } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
export const metadata = { title: "Your profile | InternCalling" };
export default async function ProfilePage() {
  const { profile, api } = await requireCompletedAccount();
  const skills = await api.request<Skill[]>("/api/v1/profile/skills");
  return <div className="mx-auto max-w-3xl px-5 py-9 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl tracking-tight">Your profile</h1><Link href="/onboarding?edit=1" className="rounded-full bg-primary px-5 py-3 text-sm text-on-primary hover:bg-primary-hover">Edit profile</Link></div><p className="mt-4 text-sm leading-7 text-muted">The details behind your internship matches.</p><dl className="mt-8 grid gap-6 rounded-panel bg-card p-6 sm:grid-cols-2 sm:p-9">{[["Degree level", profile.degree_level === "bachelor" ? "Bachelor's" : "Master's"], ["University", profile.university], ["Field of study", profile.field_of_study], ["Graduation year", profile.graduation_year], ["Location", profile.location]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 text-sm break-words">{value}</dd></div>)}</dl><section className="mt-8"><h2 className="text-lg">Skills</h2><div className="mt-4 flex flex-wrap gap-2">{skills.map((skill) => <Badge key={skill.id}>{skill.name}</Badge>)}{!skills.length && <p className="text-sm text-muted">No skills added yet. Edit your profile to add them.</p>}</div></section></div>;
}
