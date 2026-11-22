"use client";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Skill } from "@/lib/api/types";
import { groupedSkills, canonicalDiscoveryName } from "@/lib/skill-discovery";
import { normalizeSkillName, validateSkillName } from "@/lib/profile-skills";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GroupedSkillPicker({ catalog, selected, loading, error, disabled, onRetry, onAdd, mode = "inline", feedbackContent }: {
  catalog: Skill[]; selected: Pick<Skill, "name">[]; loading: boolean; error: string; disabled: boolean;
  onRetry?: () => void; onAdd: (name: string) => Promise<boolean>; mode?: "inline" | "drawer"; feedbackContent?: ReactNode;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), busy = useRef(false);
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1), [feedback, setFeedback] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => mode === "drawer" ? Object.fromEntries(groupedSkills(catalog, selected, "").groups.map(group => [group.id, true])) : {});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const result = groupedSkills(catalog, selected, query, mode === "drawer");
  const groups = result.groups.map(group => ({ ...group, visible: (mode === "drawer" && query.trim() ? false : collapsed[group.id]) ? [] : group.choices.slice(0, limits[group.id] ?? 6) }));
  const choices = groups.flatMap(group => group.visible).filter(skill => !skill.selected);
  const expanded = (mode === "drawer" ? groups.some(group => group.visible.length > 0) : open && choices.length > 0) && !disabled;
  const canonical = canonicalDiscoveryName(query);
  const duplicate = selected.some(skill => normalizeSkillName(skill.name) === normalizeSkillName(canonical));
  async function add(name: string) {
    if (disabled || busy.current) return;
    const validated = validateSkillName(name);
    if (!validated.name) { setFeedback(validated.error ?? "Enter a skill."); return; }
    if (selected.some(skill => normalizeSkillName(skill.name) === validated.name)) { setFeedback("This skill is already added."); return; }
    busy.current = true; setFeedback(""); setActive(-1);
    try { if (await onAdd(validated.name)) { if (mode !== "drawer") setQuery(""); requestAnimationFrame(() => { const dialog = input.current?.closest("dialog"); if (!dialog || dialog.open) input.current?.focus(); }); } }
    finally { busy.current = false; }
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { if (mode !== "drawer") { event.preventDefault(); event.stopPropagation(); } setOpen(false); setActive(-1); }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length) {
      event.preventDefault(); setOpen(true);
      const next = event.key === "ArrowDown" ? (active + 1) % choices.length : active <= 0 ? choices.length - 1 : active - 1;
      setActive(next); document.getElementById(id + "-option-" + next)?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && expanded && active >= 0 && choices[active]) { event.preventDefault(); void add(choices[active].name); }
    if (event.key === "Tab") setOpen(false);
  }
  return <div className={mode === "drawer" ? "flex min-h-0 flex-1 flex-col [@media(max-height:400px)]:block" : "mt-6 space-y-4"}>
    <form onSubmit={event => { event.preventDefault(); void add(canonical); }} className={mode === "drawer" ? "shrink-0 space-y-2 px-4 pb-3" : "flex flex-col gap-3 sm:flex-row sm:items-end"}>
      <Input ref={input} label="Search or add a skill" name="skill" value={query} maxLength={100} disabled={disabled} wrapperClassName="min-w-0 flex-1" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={id + "-suggestions"} aria-activedescendant={expanded && active >= 0 && choices[active] ? id + "-option-" + active : undefined} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); setFeedback(""); }} onKeyDown={keyDown} />
      <Button type="submit" disabled={disabled || !query.trim() || duplicate}>Add skill</Button>
    </form>
    <div className={mode === "drawer" ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 [@media(max-height:400px)]:overflow-visible" : "space-y-4"}>
    {feedbackContent}
    <p className="text-xs leading-6 text-muted">Browse suggested categories, or search by name or abbreviation. Use arrow keys and Enter for search suggestions. You can also add a custom skill.</p>
    {loading && <p role="status" className="text-sm text-muted">Loading additional skill suggestions...</p>}
    {error && <div role="alert" className="space-y-2 text-sm"><p>Additional suggestions could not be loaded. Suggested categories and custom skills are still available.</p><Button variant="secondary" size="sm" disabled={loading} onClick={onRetry}>Retry suggestions</Button></div>}
    {onRetry && !loading && !error && <Button variant="ghost" size="sm" onClick={onRetry}>Refresh suggestions</Button>}
    {feedback && <p role="alert" className="text-sm">{feedback}</p>}
    {duplicate && <p role="status" className="text-sm text-muted">This skill is already added.</p>}
    {!result.groups.some(group => group.choices.length) && !duplicate && <p role="status" className="text-sm text-muted">{result.matches ? "All matching suggested skills are already added." : loading ? "No matching suggested skills yet. Additional suggestions are loading." : error ? "No matching suggested skills. Additional suggestions are unavailable; retry or add a custom skill." : "No matching suggestions. You can add a custom skill."}</p>}
    {mode !== "drawer" && expanded && <div id={id + "-suggestions"} role="listbox" aria-label="Skill suggestions" className="max-h-64 space-y-3 overflow-y-auto rounded-card border border-border bg-surface p-3">
      {groups.filter(group => group.visible.length).map(group => <div key={group.id} role="group" aria-label={group.label}><p role="presentation" className="px-3 py-2 text-xs text-muted">{group.label}</p>{group.visible.map(skill => {
        const index = choices.indexOf(skill);
        return <div key={skill.name} role="option" id={id + "-option-" + index} aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => { void add(skill.name); }} className={"cursor-pointer rounded-control px-3 py-3 text-sm " + (active === index ? "bg-primary/20" : "hover:bg-elevated")}>{skill.name}</div>;
      })}</div>)}
    </div>}
    <div id={mode === "drawer" ? id + "-suggestions" : undefined} role={mode === "drawer" ? "listbox" : undefined} className="space-y-3" aria-label="Browse skill categories">
      {groups.filter(group => mode !== "drawer" || !query.trim() || group.choices.length > 0).map(group => <section key={group.id} className="rounded-card border border-border p-4">
        <h3><button type="button" aria-expanded={mode === "drawer" && !!query.trim() || !collapsed[group.id]} aria-controls={id + "-" + group.id} className="w-full rounded-control py-2 text-left text-sm font-medium" onClick={() => { setCollapsed(current => ({ ...current, [group.id]: !current[group.id] })); setActive(-1); }}>{group.label} <span className="text-muted">({group.id === "other" && loading ? "Loading" : group.id === "other" && error ? "Unavailable" : group.choices.length})</span></button></h3>
        <div id={id + "-" + group.id} hidden={mode === "drawer" && query.trim() ? false : !!collapsed[group.id]}>
          <div role={mode === "drawer" ? "group" : undefined} aria-label={group.label} className="mt-2 flex flex-wrap gap-2">{group.visible.map(skill => <Button key={skill.name} className={mode === "drawer" && !skill.selected && choices.indexOf(skill) === active ? "outline outline-2 outline-accent" : undefined} id={mode === "drawer" && !skill.selected ? id + "-option-" + choices.indexOf(skill) : undefined} role={mode === "drawer" ? "option" : undefined} aria-selected={mode === "drawer" ? !!skill.selected : undefined} aria-disabled={mode === "drawer" ? disabled || !!skill.selected : undefined} variant="secondary" size="sm" disabled={disabled || !!skill.selected} onClick={() => { void add(skill.name); }}>{skill.selected ? <><span aria-hidden="true">{"\u2713"} </span>{skill.name}<span className="sr-only"> (added)</span></> : skill.name}</Button>)}</div>
          {!group.choices.length && <p className="mt-2 text-xs text-muted">{group.id === "other" && loading ? "Additional suggestions are loading." : group.id === "other" && error ? "Additional suggestions are unavailable." : "No available skills for this search."}</p>}
          {group.choices.length > 6 && <Button variant="ghost" size="sm" onClick={() => { setLimits(current => ({ ...current, [group.id]: group.visible.length >= group.choices.length ? 6 : (current[group.id] ?? 6) + 6 })); setActive(-1); }}>{group.visible.length >= group.choices.length ? "Show fewer " : "Show more "}{group.label.toLowerCase()}</Button>}
        </div>
      </section>)}
    </div>
    </div>
  </div>;
}
