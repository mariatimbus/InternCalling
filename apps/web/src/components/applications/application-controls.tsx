"use client";
import { useActionState, useId, useState, type ReactNode } from "react";
import { updateTracking } from "@/app/(workspace)/applications/actions";
import type { Application } from "@/lib/api/types";
import { applicationStatuses, type TrackingState } from "@/lib/applications";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";

const statusLabel = (status: Application["status"]) => status[0].toUpperCase() + status.slice(1);

export function ApplicationControls({ opportunityId, application = null, showSave = true, inline = false, allowTracking = true, tailoring }: {
  opportunityId: string; application?: Application | null; showSave?: boolean;
  inline?: boolean; allowTracking?: boolean; tailoring?: ReactNode;
}) {
  const notesId = useId();
  const [open, setOpen] = useState<"status" | "notes" | "tailor" | null>(null);
  const [tailorOpened, setTailorOpened] = useState(false);
  const [draftStatus, setDraftStatus] = useState<Application["status"]>();
  const [draftNotes, setDraftNotes] = useState<string>();
  const [state, action, pending] = useActionState(async (previous: TrackingState, form: FormData) => {
    const result = await updateTracking(previous, form);
    if (!result.error) {
      setDraftStatus(undefined);
      setDraftNotes(undefined);
    }
    return result;
  }, { error: "", message: "", application });
  const current = state.application;
  const statusPanelId = notesId + "-status";
  const notesPanelId = notesId + "-notes";
  const tailorPanelId = notesId + "-tailor";
  function toggle(panel: NonNullable<typeof open>) {
    if (panel === "tailor") setTailorOpened(true);
    setOpen((previous) => previous === panel ? null : panel);
  }
  return <>
    {inline && <div role="group" aria-label="Application tracking" className="flex flex-wrap gap-2">
      {allowTracking && <Button variant="secondary" size="sm" aria-expanded={open === "status"} aria-controls={statusPanelId}
        onClick={() => toggle("status")}>Status · {current ? statusLabel(current.status) : "Not tracked"}</Button>}
      {allowTracking && current && <Button variant="secondary" size="sm" aria-expanded={open === "notes"} aria-controls={notesPanelId}
        onClick={() => toggle("notes")}>{current.notes && <Icon name="pencil" className="size-4" />}{current.notes ? "Edit notes" : "Notes"}</Button>}
      {tailoring && <Button variant="secondary" size="sm" aria-expanded={open === "tailor"} aria-controls={tailorPanelId}
        onClick={() => toggle("tailor")}>Tailor resume</Button>}
    </div>}
    {inline && tailoring && <div id={tailorPanelId} hidden={open !== "tailor"} className="mt-3">{tailorOpened && tailoring}</div>}
    {allowTracking && <form action={action} hidden={inline && open !== "status" && open !== "notes"}
      className={inline ? "mt-3 space-y-3 border-t border-border pt-3" : "space-y-4 border-t border-border pt-5"}>
    <input type="hidden" name="opportunity_id" value={opportunityId} />
    <fieldset disabled={pending} className="space-y-4">
      {!inline && <legend className="text-sm font-medium">Application tracking</legend>}
      {current ? <>
        <div id={statusPanelId} hidden={inline && open !== "status"}>
          <Select label="Application status" name="status" value={draftStatus ?? current.status}
            onChange={(event) => setDraftStatus(event.target.value as Application["status"])}>
            {applicationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </Select>
          {current.applied_at && <p className="mt-2 text-xs text-muted">Applied: {new Date(current.applied_at).toLocaleDateString("en-GB", { timeZone: "UTC" })}</p>}
        </div>
        <div id={notesPanelId} hidden={inline && open !== "notes"}><label htmlFor={notesId} className="block text-sm">Notes</label>
          <textarea id={notesId} name="notes" rows={3} maxLength={10000} value={draftNotes ?? current.notes ?? ""}
            onChange={(event) => setDraftNotes(event.target.value)} className="mt-2 w-full rounded-control border border-border bg-background p-3" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="update">Save progress</Button>
          {(!inline || open === "status") && <Button type="submit" name="intent" value="remove" variant="secondary">
            {current.status === "saved" ? "Unsave" : "Remove tracking"}
          </Button>}
        </div>
      </> : <div id={statusPanelId} className="flex flex-wrap gap-3">
        {showSave && <Button type="submit" name="intent" value="save" variant="secondary">Save opportunity</Button>}
        <Button type="submit" name="intent" value="apply">Mark Applied</Button>
      </div>}
    </fieldset>
    {!inline && <p role={state.error ? "alert" : "status"} className="text-sm text-muted">{pending ? "Saving…" : state.error || state.message}</p>}
  </form>}
    {inline && allowTracking && <p role={state.error ? "alert" : "status"} className="text-sm text-muted">{pending ? "Saving…" : state.error || state.message}</p>}
  </>;
}
