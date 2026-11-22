"use client";

import type { Profile, Skill } from "@/lib/api/types";
import { profileCompletion } from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";

export function ProfileCompletion({ profile, skills, pending, onRetry }: {
  profile: Profile | null; skills: Skill[] | null; pending: boolean; onRetry: () => void;
}) {
  const completion = profileCompletion(profile, skills);
  return <section className="mt-6 rounded-card bg-card px-5 py-4 sm:px-6" aria-labelledby="profile-completion-title" aria-busy={pending}>
    <h2 id="profile-completion-title" className="card-title" aria-live="polite">Profile completion{completion ? ": " + completion.percentage + "%" : ""}</h2>
    {completion ? <>
      <progress aria-label="Profile completion" value={completion.percentage} max={100} className="mt-3 block h-2 w-full overflow-hidden rounded-full accent-primary" />
      <span className="sr-only">{completion.completed} of 8 profile items completed</span>
    </> : <div role="alert" className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm text-muted">Saved profile or skills data could not be confirmed. Completion is unavailable.</p><Button variant="secondary" size="sm" disabled={pending} onClick={onRetry}>{pending ? "Refreshing completion..." : "Retry completion"}</Button></div>}
  </section>;
}
