"use client";
import { useActionState } from "react";
import { updateTracking } from "@/app/(workspace)/applications/actions";
import type { Application } from "@/lib/api/types";
import { applicationStatuses } from "@/lib/applications";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function ApplicationControls({ opportunityId, application = null }: { opportunityId: string; application?: Application | null }) {
  const [state, action, pending] = useActionState(updateTracking, { error: "", message: "", application });
  const current = state.application;
  return <form action={action} className="space-y-4 border-t border-border pt-5">
    <input type="hidden" name="opportunity_id" value={opportunityId} />
    <fieldset disabled={pending} className="space-y-4">
      <legend className="text-sm font-medium">Application tracking</legend>
      {current ? <>
        <Select label="Application status" name="status" defaultValue={current.status} key={current.status}>
          {applicationStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
        </Select>
        <label className="block text-sm">Notes<textarea name="notes" rows={3} maxLength={10000} defaultValue={current.notes ?? ""} className="mt-2 w-full rounded-control border border-border bg-background p-3" /></label>
        {current.applied_at && <p className="text-xs text-muted">Applied: {new Date(current.applied_at).toLocaleDateString("en-GB", { timeZone: "UTC" })}</p>}
        <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="update">Save progress</Button><Button type="submit" name="intent" value="remove" variant="secondary">{current.status === "saved" ? "Unsave" : "Remove tracking"}</Button></div>
      </> : <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="save" variant="secondary">Save opportunity</Button><Button type="submit" name="intent" value="apply">Mark Applied</Button></div>}
    </fieldset>
    <p role={state.error ? "alert" : "status"} className="text-sm text-muted">{pending ? "Saving…" : state.error || state.message}</p>
  </form>;
}
