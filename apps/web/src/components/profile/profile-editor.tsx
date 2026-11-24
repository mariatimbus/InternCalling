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

const labels: Record<ProfileField, string> = { headline: "Headline", bio: "Bio", degree_level: "Degree level", university: "University", field_of_study: "Field of study", graduation_year: "Graduation year", location: "Location" };

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
  const input = (key: Exclude<ProfileField, "bio" | "degree_level">) => <Input label={labels[key]} name={key} value={draft[key]} type={key === "graduation_year" ? "number" : "text"} min={key === "graduation_year" ? 1900 : undefined} max={key === "graduation_year" ? 2100 : undefined} step={key === "graduation_year" ? 1 : undefined} maxLength={key === "graduation_year" ? undefined : 255} disabled={saving} error={fields[key]} onChange={(event) => update(key, event.target.value)} />;

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
