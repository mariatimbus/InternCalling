"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Application, Opportunity, Match, Eligibility, Skill } from "@/lib/api/types";
import type { SaveResult } from "@/app/(workspace)/jobs/save-action";
import { JobCard, type JobSummary } from "@/components/jobs/job-card";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { opportunitySummary } from "@/lib/opportunities";
import { degreeLabels, safeJobSource, studyYears } from "@/components/jobs/opportunity-details";
import { OpportunityDetailView, opportunityDisplayDate } from "@/components/jobs/opportunity-detail-view";
import type { OpportunityAssessment } from "@/lib/api/opportunity-assessment";
import { companyLogoUrl as logoFor } from "@/lib/company-logo";
import { topReason } from "@/lib/match-reasons";

export type RankedOpportunity = {
  opportunity: Opportunity | Application["opportunity"];
  match: Match | null;
  status?: Application["status"];
  eligibility?: Eligibility;
  companyLogoUrl?: string | null;
};
function summary({ opportunity: job, match, companyLogoUrl }: RankedOpportunity): JobSummary {
  const card = opportunitySummary(job);
  return { ...card, initials: job.organization?.trim() ? card.initials : "–",
    companyLogoUrl: companyLogoUrl ?? logoFor("url" in job ? job.company_domain : null, "source" in job ? job.source : null),
    matchScore: match?.score ?? null, eligibility: match?.eligibility ?? "unknown", matchReason: topReason(match?.reasons) };
}
function cardMetadata(job: RankedOpportunity["opportunity"]) {
  const deadline = { label: "Deadline", value: opportunityDisplayDate(job.deadline) };
  const fields = [deadline];
  if ("url" in job) {
    fields.push(
      { label: "Posted", value: opportunityDisplayDate(job.posted_at) },
      { label: "Degree level", value: job.degree_level ? degreeLabels[job.degree_level] : undefined },
      { label: "Study year", value: studyYears(job.study_year) },
    );
  }
  return fields.filter((field): field is { label: string; value: string } => Boolean(field.value));
}

type SaveAction = (id: string) => Promise<SaveResult>;
type SaveState = SaveResult | "pending";
const emptyApplications: Application[] = [];

function useOpportunitySave(saveAction?: SaveAction, applications?: Application[]) {
  const [states, setStates] = useState<Record<string, { result: SaveState; applications?: Application[] }>>({});
  const saving = useRef(new Set<string>());

  function stateFor(id: string) {
    const state = states[id];
    if (!state || (state.result !== "pending" && "status" in state.result && state.applications !== applications)) return;
    return state.result;
  }

  async function submit(id: string) {
    if (!saveAction || saving.current.has(id)) return;
    saving.current.add(id);
    const remember = (result: SaveState) => setStates((current) => ({ ...current, [id]: { result, applications } }));
    remember("pending");
    try {
      remember(await saveAction(id));
    } catch {
      remember({ error: "We could not confirm the save. Try again." });
    } finally {
      saving.current.delete(id);
    }
  }

  return { stateFor, submit };
}

function SaveControl({ title, status, state, onSave }: {
  title: string;
  status?: Application["status"];
  state?: SaveState;
  onSave?: () => void;
}) {
  const pending = state === "pending";
  const result = pending ? undefined : state;
  const tracked = status ?? (result && "status" in result ? result.status : undefined);
  if (tracked) return <span role="status"><Badge className="capitalize">{tracked}</Badge></span>;
  if (!onSave) return null;
  const error = result && "error" in result ? result.error : undefined;

  return <div className="relative z-10 flex flex-col items-end gap-1 text-right">
    <Button variant="secondary" size="sm" disabled={pending} onClick={onSave} aria-label={`${pending ? "Saving" : error ? "Retry save for" : "Save"} ${title}`}>
      {pending ? "Saving…" : error ? "Retry save" : "Save"}
    </Button>
    {error && <p role="alert" className="max-w-48 text-xs text-muted">{error}</p>}
  </div>;
}

export function StandaloneOpportunitySave({ id, title, status, saveAction }: {
  id: string;
  title: string;
  status?: Application["status"];
  saveAction?: SaveAction;
}) {
  const { stateFor, submit } = useOpportunitySave(saveAction);
  return <SaveControl title={title} status={status} state={stateFor(id)} onSave={saveAction ? () => submit(id) : undefined} />;
}

const subscribeHydration = () => () => {};

export function RecommendedJobs({ items, applications = emptyApplications, label = "Recommended opportunities", saveAction, detailContext = "", loadAssessment, loadCatalog, copilotEnabled = false, profileSkills = null, listFooter, children }: {
  items: RankedOpportunity[];
  applications?: Application[];
  label?: string;
  saveAction?: (id: string) => Promise<SaveResult>;
  detailContext?: string;
  loadAssessment: (id: string) => Promise<OpportunityAssessment>;
  loadCatalog: (id: string) => Promise<Opportunity | null>;
  copilotEnabled?: boolean;
  profileSkills?: Skill[] | null;
  listFooter?: ReactNode;
  children?: ReactNode;
}) {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [selected, setSelected] = useState(items[0]?.opportunity.id);
  const [open, setOpen] = useState(false);
  const { stateFor, submit } = useOpportunitySave(saveAction, applications);
  const current = items.find((item) => item.opportunity.id === selected) ?? items[0];
  const currentId = current?.opportunity.id;
  const summaryId = current && !("url" in current.opportunity) ? currentId : undefined;
  const [catalog, setCatalog] = useState<{ id: string; opportunity: Opportunity | null }>();
  const desktopPanel = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<{ id: string; value: OpportunityAssessment }>();
  useEffect(() => {
    const panel = desktopPanel.current;
    const workspace = panel?.closest("main");
    if (!panel || !workspace) return;
    const fitPanel = () => {
      const top = panel.getBoundingClientRect().top;
      const bottom = workspace.getBoundingClientRect().bottom;
      panel.style.height = Math.max(176, Math.floor(bottom - top - 12)) + "px";
    };
    const observer = new ResizeObserver(fitPanel);
    observer.observe(workspace);
    workspace.addEventListener("scroll", fitPanel, { passive: true });
    fitPanel();
    return () => {
      observer.disconnect();
      workspace.removeEventListener("scroll", fitPanel);
    };
  }, []);
  useEffect(() => {
    if (!summaryId || !loadCatalog) return;
    let active = true;
    loadCatalog(summaryId).then(
      (opportunity) => {
        if (active) setCatalog({ id: summaryId, opportunity: opportunity?.id === summaryId ? opportunity : null });
      },
      () => { if (active) setCatalog({ id: summaryId, opportunity: null }); },
    );
    return () => { active = false; };
  }, [summaryId, loadCatalog]);
  useEffect(() => {
    if (!currentId) return;
    let active = true;
    loadAssessment(currentId).then(
      (value) => { if (active) setResolved({ id: currentId, value }); },
      () => { if (active) setResolved({ id: currentId, value: { match: null, eligibility: null } }); },
    );
    return () => { active = false; };
  }, [currentId, loadAssessment]);

  if (!current) return null;
  function saveControl(item: RankedOpportunity) {
    const { id, title } = item.opportunity;
    const onSave = saveAction ? () => submit(id) : undefined;
    return item.status || onSave ? <SaveControl title={title} status={item.status} state={stateFor(id)} onSave={onSave} /> : undefined;
  }
  const assessment = resolved?.id === current.opportunity.id ? resolved.value : null;
  const application = applications.find((item) => item.opportunity_id === current.opportunity.id);
  const selectedCatalog = summaryId && catalog?.id === summaryId ? catalog : undefined;
  const detail = <OpportunityDetailView opportunity={selectedCatalog?.opportunity ?? current.opportunity}
    catalogStatus={summaryId ? selectedCatalog ? selectedCatalog.opportunity ? "loaded" : "failed" : "loading" : undefined}
    status={current.status} copilotEnabled={copilotEnabled}
    profileSkills={profileSkills}
    companyLogoUrl={current.companyLogoUrl} detailContext={detailContext} assessment={assessment} saveControl={saveControl(current)}
    tracking={{ application: application ?? null, showSave: !saveAction }} />;
  return <>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="min-w-0 space-y-3" aria-label={label}>
        {children}
        <h2 className="sr-only">{label}</h2>
        {items.map((item) => <JobCard
          key={item.opportunity.id}
          job={summary(item)}
          density="compact"
          disabled={!hydrated}
          selected={current.opportunity.id === item.opportunity.id}
          showMatch={"url" in item.opportunity}
          metadata={cardMetadata(item.opportunity)}
          officialUrl={"url" in item.opportunity ? safeJobSource(item.opportunity.url) : null}
          onSelect={() => { setSelected(item.opportunity.id); setOpen(true); }}
          action={saveControl(item)}
        />)}
        {listFooter}
      </div>
      <div ref={desktopPanel} className="sticky top-6 hidden h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-panel border border-line bg-surface xl:flex" aria-label="Selected opportunity">
        {detail}
      </div>
    </div>
    <Drawer open={open} onClose={() => setOpen(false)} title="Opportunity details" size="detail" closeAt="(min-width: 1280px)">
      {detail}
    </Drawer>
  </>;
}
