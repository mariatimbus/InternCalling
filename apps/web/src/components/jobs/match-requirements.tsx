import type { MatchRequirement } from "@/lib/api/types";
import { requirementChips, requirementIcons, requirementSummary, type Tone } from "@/lib/match-requirements";
import { Icon } from "@/components/ui/icon";

const chipTone: Record<Tone, string> = {
  met: "border-success-border/25 bg-success-surface text-success-foreground",
  partial: "border-accent/25 bg-primary/10 text-accent",
  missing: "border-danger-border/25 bg-danger-surface text-danger-foreground",
};
const barTone: Record<Tone, string> = { met: "bg-success-border", partial: "bg-primary", missing: "bg-danger-border/35" };
const statusText: Record<Tone, string> = { met: "Met", partial: "Partly met", missing: "Missing" };

/** A bar split by requirement weight, filled by how well each one is met. */
function RequirementBar({ requirements }: { requirements: MatchRequirement[] }) {
  return <span aria-hidden="true" className="flex h-1.5 min-w-16 flex-1 gap-0.5 overflow-hidden rounded-full">
    {requirements.map((r) => <span key={r.key} style={{ flexGrow: r.weight }} className={`h-full ${barTone[r.status]}`} />)}
  </span>;
}

/** Job card: how many requirements match, then the matches (green) and gaps (red) at a glance. */
export function MatchChips({ requirements }: { requirements: MatchRequirement[] | undefined }) {
  const { met, total } = requirementSummary(requirements);
  const chips = requirementChips(requirements);
  if (!total) return null;
  return <div className="min-w-0 space-y-2">
    <p className="flex items-center gap-2 text-xs text-muted">
      <span><strong className="font-semibold text-foreground">{met} of {total}</strong> requirements met</span>
      <RequirementBar requirements={requirements ?? []} />
    </p>
    <ul aria-label="How you match" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => <li key={chip.key} title={chip.title}
        className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${chipTone[chip.tone]}`}>
        <Icon name={chip.tone === "missing" ? "x" : chip.icon} className="size-3.5 shrink-0" />
        {chip.strong.length > 0 && <strong className="truncate font-semibold">{chip.strong.join(" · ")}</strong>}
        {chip.label && <span className="truncate">{chip.label}</span>}
        <span className="sr-only">{" — " + statusText[chip.tone]}</span>
      </li>)}
    </ul>
  </div>;
}

/** Job page: every requirement the posting states, what matched and what is missing. */
export function RequirementList({ requirements, Heading }: { requirements: MatchRequirement[]; Heading: "h3" | "h4" | "h5" }) {
  const { met, total } = requirementSummary(requirements);
  return <div className="space-y-3">
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted"><strong className="font-semibold text-foreground">{met} of {total}</strong> requirements met</span>
      <RequirementBar requirements={requirements} />
    </div>
    <ul className="space-y-2.5">
      {requirements.map((r) => <li key={r.key} className={`rounded-control border px-3 py-2.5 ${chipTone[r.status]}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon name={requirementIcons[r.key]} className="size-4 shrink-0" />
          <Heading className="text-sm font-semibold">{r.label}</Heading>
          <span className="rounded-full bg-surface/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{statusText[r.status]}</span>
          <span className="ms-auto text-xs opacity-80 tabular-nums">{Math.round(r.earned)} / {r.weight} pts</span>
        </div>
        <p className="mt-1 text-sm">{r.summary}</p>
        {(r.matched.length > 0 || r.missing.length > 0) && <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {r.matched.map((item) => <span key={"m" + item} className="inline-flex items-center gap-1 rounded-full border border-success-border/30 bg-surface px-2 py-0.5 text-success-foreground">
            <Icon name="check" className="size-3" /><strong className="font-semibold">{item}</strong></span>)}
          {r.missing.map((item) => <span key={"x" + item} className="inline-flex items-center gap-1 rounded-full border border-danger-border/30 bg-surface px-2 py-0.5 text-danger-foreground">
            <Icon name="x" className="size-3" />{item}</span>)}
        </div>}
      </li>)}
    </ul>
  </div>;
}
