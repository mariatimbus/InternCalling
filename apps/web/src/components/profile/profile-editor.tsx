"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
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
export function ProfileEditor({ initialProfile, persistedProfile, onConfirmed, onUnavailable, ref, compactDesktop = false }: {
  initialProfile: Profile; persistedProfile?: Profile; onConfirmed?: (profile: Profile) => void; onUnavailable?: () => void;
  ref?: Ref<ProfileEditorHandle>; compactDesktop?: boolean;
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
  useImperativeHandle(ref, () => ({ edit(field) {
    focusField.current = field;
    if (editing) form.current?.querySelector<HTMLElement>('[name="' + field + '"]')?.focus();
    else { setProfile(current); setDraft(profileDraft(current)); setSuccess(""); setEditing(true); }
  } }), [editing, current]);

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

  return <section data-profile-compact={compactDesktop ? "editor" : undefined} className={`mt-8 rounded-panel bg-card p-6 sm:p-9 ${compactDesktop ? "xl:mt-5 xl:p-4" : ""}`} aria-labelledby="profile-details-title">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 ref={sectionTitle} id="profile-details-title" tabIndex={-1} className="section-title">Profile details</h2>{!editing && <Button onClick={() => { focusField.current = "headline"; setProfile(current); setDraft(profileDraft(current)); setSuccess(""); setEditing(true); }}>Edit profile</Button>}</div>
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
    </form> : <dl className={`mt-6 grid gap-6 sm:grid-cols-2 ${compactDesktop ? "xl:mt-4 xl:grid-cols-3 xl:gap-3" : ""}`}>
      {(Object.keys(labels) as ProfileField[]).map((key) => <div key={key} className={key === "bio"
        ? `min-w-0 sm:col-span-2 ${compactDesktop ? "xl:col-span-3" : ""}` : "min-w-0"}>
        <dt className="metadata-text">{labels[key]}</dt>
        <dd className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${compactDesktop ? "xl:mt-1" : ""}`}>{display(key)}</dd>
      </div>)}
    </dl>}
  </section>;
}
