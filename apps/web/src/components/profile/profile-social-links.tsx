"use client";

import { useState, type FormEvent } from "react";
import { saveSocialLinks } from "@/app/(workspace)/profile/social-actions";
import { validSocialLink, type SocialLinks } from "@/lib/profile-social-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";

const services = ["linkedin", "github"] as const;
const names = { linkedin: "LinkedIn", github: "GitHub" };
const icons = {
  linkedin: <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5"><path d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6ZM8 18.5H5V9h3v9.5ZM6.5 7.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm12 10.8h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4v4.7h-3V9h2.9v1.3c.4-.8 1.4-1.5 2.8-1.5 3 0 3.6 1.9 3.6 4.3v5.4Z" /></svg>,
  github: <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-5"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>,
};

export function ProfileSocialLinks({ initialLinks }: { initialLinks: SocialLinks }) {
  const [links, setLinks] = useState(initialLinks);
  const [draft, setDraft] = useState(initialLinks);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (services.some((service) => !validSocialLink(draft[service].trim(), service))) {
      setError("Enter valid HTTPS profile links for LinkedIn and GitHub."); return;
    }
    setSaving(true); setError("");
    try {
      const result = await saveSocialLinks(draft);
      if (result.links) { setLinks(result.links); setDraft(result.links); setEditing(false); }
      else setError(result.error ?? "Links could not be saved.");
    } catch { setError("Links could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  return <section className="rounded-card bg-card px-5 py-5 sm:px-6" aria-labelledby="profile-social-title">
    <div className="flex items-center justify-between gap-3"><h2 id="profile-social-title" className="card-title">Social links</h2>{!editing && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Icon name="pencil" className="size-4" />Edit</Button>}</div>
    {editing ? <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
      {services.map((service) => <Input key={service} label={names[service]} type="url" value={draft[service]} maxLength={512} placeholder={`https://${service === "linkedin" ? "www.linkedin.com/in" : "github.com"}/your-name`} disabled={saving} error={draft[service] && !validSocialLink(draft[service].trim(), service) ? "Enter a valid profile URL." : undefined} onChange={(event) => setDraft({ ...draft, [service]: event.target.value })} />)}
      {error && <p role="alert" className="text-sm text-danger-foreground">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button><Button variant="secondary" size="sm" disabled={saving} onClick={() => { setDraft(links); setError(""); setEditing(false); }}>Cancel</Button></div>
    </form> : <div className="mt-4 space-y-3">
      {services.map((service) => <div key={service} className="flex min-w-0 items-center gap-3 text-sm text-foreground">{icons[service]}{links[service] ? <a href={links[service]} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all underline underline-offset-2 hover:text-primary">{links[service]}</a> : <span className="text-muted">Add your {names[service]} profile</span>}</div>)}
    </div>}
  </section>;
}
