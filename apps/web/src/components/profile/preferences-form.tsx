"use client";
import { useActionState } from "react";
import { savePreferences } from "@/app/(workspace)/profile/actions";
import type { Profile } from "@/lib/api/types";
import { studyYears } from "@/lib/profile-preferences";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function PreferencesForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(savePreferences, { message: "", error: false });
  return <section className="mt-9"><h2 className="text-lg">Study and job preferences</h2>
    <p className="mt-2 text-sm text-muted">Optional details to improve relevance. Leave unknown details blank.</p>
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
    </form></section>;
}
