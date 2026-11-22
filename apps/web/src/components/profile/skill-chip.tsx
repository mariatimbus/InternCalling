import type { Skill } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";

/** Removable, keyboard-accessible skill label; persistence belongs to the caller. */
export function SkillChip({ skill, disabled, onRemove }: { skill: Pick<Skill, "name">; disabled?: boolean; onRemove: () => void }) {
  return <Badge className="max-w-full gap-1 py-0 pl-3 pr-1"><span className="min-w-0 break-words">{skill.name}</span><button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove ${skill.name}`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="m6 6 12 12M18 6 6 18" /></svg></button></Badge>;
}
