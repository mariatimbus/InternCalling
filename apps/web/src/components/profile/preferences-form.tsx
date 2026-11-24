"use client";
import { useActionState } from "react";
import { savePreferences } from "@/app/(workspace)/profile/preferences-actions";
import type { Profile } from "@/lib/api/types";
import { studyYears } from "@/lib/profile-preferences";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function PreferencesForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(savePreferences, { message: "", error: false });
  const summary = [
    ["Study year", profile.study_year ? profile.study_year[0].toUpperCase() + profile.study_year.slice(1) + " year" : "Not provided"],
    ["Remote preference", profile.remote_preferred == null ? "Not provided" : profile.remote_preferred ? "Prefer remote" : "No remote preference"],
    ["Interests", profile.interests?.join(", ") || "Not provided"],
    ["Tech domains", profile.preferred_tech_domains?.join(", ") || "Not provided"],
    ["Preferred locations", profile.preferred_locations?.join(", ") || "Not provided"],
  ];
  return <section id="profile-preferences" className="mt-9"><h2 className="section-title">Study and job preferences</h2>
    <dl className="mt-5 space-y-4">
      {summary.map(([label, value]) => <div key={label} className="grid gap-1 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
        <dt className="text-muted">{label}</dt><dd className="text-foreground [overflow-wrap:anywhere]">{value}</dd>
      </div>)}
    </dl>
    <details className="mt-5">
    <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-sm text-sm font-medium text-accent underline underline-offset-4">Edit preferences</summary>
    <p className="mt-3 text-sm text-muted">Optional details to improve relevance. Leave unknown details blank.</p>
    <form action={action} className="mt-5 space-y-5">
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        <Select label="Study year" name="study_year" defaultValue={profile.study_year ?? ""}>
          <option value="">Not specified</option>{studyYears.map((year) => <option key={year} value={year}>{year[0].toUpperCase() + year.slice(1)} year</option>)}
        </Select>
        <Select label="Remote preference" name="remote_preferred" defaultValue={profile.remote_preferred == null ? "" : String(profile.remote_preferred)}>
          <option value="">Not specified</option><option value="true">Prefer remote</option><option value="false">No remote preference</option>
        </Select>
        <Input label="Interests" name="interests" hint="Comma-separated, for example AI, research" defaultValue={profile.interests?.join(", ") ?? ""} maxLength={5050} />
        <Input label="Tech domains" name="preferred_tech_domains" hint="Comma-separated, for example backend, data science" defaultValue={profile.preferred_tech_domains?.join(", ") ?? ""} maxLength={5050} />
        <Input label="Preferred locations" name="preferred_locations" hint="Comma-separated, for example Berlin, Bucharest" defaultValue={profile.preferred_locations?.join(", ") ?? ""} maxLength={5050} />
      </fieldset>
      <p role={state.error ? "alert" : "status"} className="text-sm text-muted">{state.message}</p>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
    </form></details></section>;
}
