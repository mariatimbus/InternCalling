"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import type { Profile } from "@/lib/api/types";
import { changedProfileFields, profileDraft, validateProfileDraft, type ProfileField, type ProfileFieldErrors } from "@/lib/profile-edit";
import { saveProfile } from "@/app/(workspace)/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, fieldControl } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/error-state";

const labels: Record<ProfileField, string> = { headline: "Headline", bio: "Bio", degree_level: "Degree level", university: "University", field_of_study: "Field of study", graduation_year: "Graduation year", location: "Location", linkedin_url: "LinkedIn", github_url: "GitHub" };

const socialIcons = {
  linkedin_url: <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6ZM8 18.5H5V9h3v9.5ZM6.5 7.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm12 10.8h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4v4.7h-3V9h2.9v1.3c.4-.8 1.4-1.5 2.8-1.5 3 0 3.6 1.9 3.6 4.3v5.4Z" /></svg>,
  github_url: <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.2-.3-4.5-1.1-4.5-5a4 4 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a4 4 0 0 1 1 2.7c0 3.9-2.3 4.7-4.5 5 .4.3.8.9.8 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" /></svg>,
};

export type ProfileEditorHandle = { edit: (field: ProfileField) => void };
export function ProfileEditor({ initialProfile, persistedProfile, onConfirmed, onUnavailable, ref, contactEmail }: {
  initialProfile: Profile; persistedProfile?: Profile; onConfirmed?: (profile: Profile) => void; onUnavailable?: () => void;
  ref?: Ref<ProfileEditorHandle>; contactEmail?: string;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const current = persistedProfile ?? profile;
  const [draft, setDraft] = useState(() => profileDraft(initialProfile));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fields, setFields] = useState<ProfileFieldErrors>({});
  const inFlight = useRef(false);
  const sectionTitle = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const focusField = useRef<ProfileField>("headline");
  useEffect(() => { if (editing) form.current?.querySelector<HTMLElement>('[name="' + focusField.current + '"]')?.focus(); }, [editing]);
  const beginEdit = useCallback((field: ProfileField) => {
    focusField.current = field;
    if (editing) form.current?.querySelector<HTMLElement>('[name="' + field + '"]')?.focus();
    else { setProfile(current); setDraft(profileDraft(current)); setSuccess(""); setEditing(true); }
  }, [editing, current]);
  useImperativeHandle(ref, () => ({ edit: beginEdit }), [beginEdit]);

  function update(key: ProfileField, value: string) { setDraft((current) => ({ ...current, [key]: value })); setFields((current) => ({ ...current, [key]: undefined })); }
  function close() { setDraft(profileDraft(current)); setEditing(false); setError(""); setFields({}); sectionTitle.current?.focus(); }
  function focusInvalid(problems: ProfileFieldErrors) { const key = Object.keys(problems)[0]; if (key) form.current?.querySelector<HTMLElement>(`[name="${key}"]`)?.focus(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const problems = validateProfileDraft(draft);
    setFields(problems); setError(""); setSuccess("");
    if (Object.keys(problems).length) { setError("Review the highlighted fields and try again."); focusInvalid(problems); return; }
    inFlight.current = true; setSaving(true);
    try {
      const result = await saveProfile(changedProfileFields(profile, draft));
      if (result.profile) {
        onConfirmed?.(result.profile); setProfile(result.profile); setDraft(profileDraft(result.profile)); setEditing(false); setSuccess(result.success ?? "Profile saved."); sectionTitle.current?.focus();
      } else { onUnavailable?.(); setError(result.error ?? "We could not save your profile. Try Save again."); setFields(result.fields ?? {}); if (result.fields) focusInvalid(result.fields); }
    } catch { onUnavailable?.(); setError("We could not confirm your profile was saved. Check your connection and try Save again. Your edits are still here."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  function display(key: ProfileField) {
    if (key === "degree_level") return current.degree_level === "bachelor" ? "Bachelor's" : current.degree_level === "master" ? "Master's" : "Not provided";
    const value = current[key];
    return typeof value === "string" ? value.trim() || "Not provided" : value ?? "Not provided";
  }
  const input = (key: Exclude<ProfileField, "bio" | "degree_level">) => <Input label={labels[key]} name={key} value={draft[key]} type={key === "graduation_year" ? "number" : key.endsWith("_url") ? "url" : "text"} min={key === "graduation_year" ? 1900 : undefined} max={key === "graduation_year" ? 2100 : undefined} step={key === "graduation_year" ? 1 : undefined} maxLength={key === "graduation_year" ? undefined : key.endsWith("_url") ? 512 : 255} placeholder={key === "linkedin_url" ? "https://www.linkedin.com/in/your-name" : key === "github_url" ? "https://github.com/your-name" : undefined} disabled={saving} error={fields[key]} onChange={(event) => update(key, event.target.value)} />;

  return <>
    <section id="profile-overview" className="py-7" aria-labelledby="profile-details-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 ref={sectionTitle} id="profile-details-title" tabIndex={-1} className="section-title">Profile details</h2>{!editing && <Button variant="ghost" size="sm" onClick={() => beginEdit("headline")}>Edit profile</Button>}</div>
    {success && <p role="status" className="mt-5 text-sm leading-6">{success}</p>}
    {editing ? <form ref={form} onSubmit={submit} noValidate aria-busy={saving} className="mt-6 space-y-6">
      <p className="text-sm leading-6 text-muted">Leave a field blank to clear it. Clearing study or location details may require onboarding again before opening Jobs.</p>
      {input("headline")}
      <Field id="profile-bio" label="Bio" hint="Headline and bio describe you; they do not affect current matching." error={fields.bio}>
        <textarea id="profile-bio" name="bio" rows={5} value={draft.bio} disabled={saving} aria-invalid={!!fields.bio} aria-describedby={fields.bio ? "profile-bio-hint profile-bio-error" : "profile-bio-hint"} className={`${fieldControl} resize-y py-3`} onChange={(event) => update("bio", event.target.value)} />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Select label="Degree level" name="degree_level" value={draft.degree_level} disabled={saving} error={fields.degree_level} onChange={(event) => update("degree_level", event.target.value)}><option value="">Not provided</option><option value="bachelor">Bachelor&apos;s</option><option value="master">Master&apos;s</option></Select>
        {input("graduation_year")}{input("university")}{input("field_of_study")}
      </div>
      {input("location")}
      <div className="grid gap-6 sm:grid-cols-2">{input("linkedin_url")}{input("github_url")}</div>
      {error && <ErrorState variant="danger" title="Profile could not be saved" description={error} />}
      {saving && <p role="status" className="text-sm text-muted">Saving your profile…</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button><Button variant="secondary" disabled={saving} onClick={close}>Cancel</Button></div>
    </form> : <div className="mt-5 space-y-4">
      <p className="text-xl font-semibold text-foreground [overflow-wrap:anywhere]">{current.headline?.trim() || "Add a headline to introduce yourself."}</p>
      {current.bio?.trim() && <p className="reading-text max-w-prose whitespace-pre-wrap [overflow-wrap:anywhere]">{current.bio}</p>}
      <div className="flex flex-wrap gap-2 text-sm text-muted">
        {current.location?.trim() && <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-elevated px-3 py-1.5 [overflow-wrap:anywhere]"><span className="font-medium">Location</span>{current.location}</span>}
        {contactEmail && <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 rounded-full bg-elevated px-3 py-1.5 [overflow-wrap:anywhere]"><span className="font-medium">Email</span><span>{contactEmail}</span></span>}
      </div>
      {(current.linkedin_url || current.github_url) && <div className="flex flex-wrap gap-3">
        {(["linkedin_url", "github_url"] as const).map((key) => current[key] && <a key={key} href={current[key]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-sm font-medium text-foreground hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2">{socialIcons[key]}{labels[key]}</a>)}
      </div>}
    </div>}
    </section>
    <section id="profile-education" aria-labelledby="profile-education-title" className="border-t border-line py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-education-title" className="section-title">Education</h2>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => beginEdit("university")}>Edit education</Button>
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h3 className="card-title [overflow-wrap:anywhere]">{current.university?.trim() || "University not provided"}</h3>
          <p className="reading-text mt-1 [overflow-wrap:anywhere]">{[current.degree_level ? display("degree_level") : "", current.field_of_study?.trim()].filter(Boolean).join(" · ") || "Add your degree and field of study."}</p>
        </div>
        <p className="metadata-text">Graduation year <span className="ml-2 font-medium text-foreground">{display("graduation_year")}</span></p>
      </div>
    </section>
  </>;
}
