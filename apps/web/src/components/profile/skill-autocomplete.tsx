"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Skill } from "@/lib/api/types";
import { normalizeSkillName, skillSuggestionState, validateSkillName } from "@/lib/profile-skills";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SkillAutocomplete({ catalog, selected, loading, error, disabled, onRetry, onAdd }: {
  catalog: Skill[]; selected: Skill[]; loading: boolean; error: string; disabled: boolean;
  onRetry: () => void; onAdd: (name: string) => Promise<boolean>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [feedback, setFeedback] = useState("");
  const suggestions = skillSuggestionState(catalog, selected, query, loading, error);
  const choices = suggestions.choices;
  const duplicate = selected.some((skill) => normalizeSkillName(skill.name) === normalizeSkillName(query));
  const expanded = open && !loading && !error && choices.length > 0 && !disabled;
  async function add(value: string) {
    if (disabled) return;
    const validated = validateSkillName(value);
    if (!validated.name) { setFeedback(validated.error ?? "Enter a skill name."); return; }
    if (selected.some((skill) => normalizeSkillName(skill.name) === validated.name)) { setFeedback("This skill is already added."); return; }
    setFeedback(""); setOpen(false); setActive(-1);
    if (await onAdd(validated.name)) { setQuery(""); requestAnimationFrame(() => input.current?.focus()); }
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); setActive(-1); return; }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length && !loading && !error) {
      event.preventDefault(); setOpen(true);
      setActive((index) => event.key === "ArrowDown" ? (index + 1) % choices.length : (index <= 0 ? choices.length - 1 : index - 1));
    } else if (event.key === "Enter" && expanded && active >= 0 && active < choices.length) {
      event.preventDefault(); void add(choices[active].name);
    } else if (event.key === "Tab") setOpen(false);
  }
  return <form className="mt-6 space-y-3" onSubmit={(event) => { event.preventDefault(); void add(query); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} aria-busy={disabled}>
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
      <Input ref={input} id={`${id}-input`} label="Search or add a skill" name="skill" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`} aria-activedescendant={expanded && active >= 0 && active < choices.length ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-help`} autoComplete="off" maxLength={100} value={query} disabled={disabled} wrapperClassName="min-w-0 flex-1" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); setFeedback(""); }} onKeyDown={keyDown} />
      <Button type="submit" disabled={disabled || !query.trim() || duplicate}>Add skill</Button>
    </div>
    <p id={`${id}-help`} className="text-xs leading-6 text-muted">Choose a suggestion with the arrow keys and Enter, or type a custom skill name. Use up to 100 characters.</p>
    {feedback && <p role="alert" className="text-sm">{feedback}</p>}
    {duplicate && <p role="status" className="text-sm text-muted">This skill is already added.</p>}
    {loading && <p role="status" className="text-sm text-muted">Loading skill suggestions...</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{error}</p><Button variant="secondary" size="sm" disabled={disabled || loading} onClick={onRetry}>Retry suggestions</Button></div>}
    {!loading && !error && <Button variant="ghost" size="sm" disabled={disabled} onClick={onRetry}>Refresh suggestions</Button>}
    {open && !loading && !error && !choices.length && !duplicate && <p role="status" className="text-sm text-muted">{suggestions.message}</p>}
    {expanded && <ul id={`${id}-list`} role="listbox" aria-label="Skill suggestions" className="max-h-60 overflow-y-auto rounded-card border border-border bg-surface p-2">
      {choices.map((skill, index) => <li key={skill.id} role="option" id={`${id}-option-${index}`} aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => { void add(skill.name); }} className={`cursor-pointer break-words rounded-control px-4 py-3 text-sm ${active === index ? "bg-primary/20 text-foreground" : "text-muted hover:bg-elevated"}`}>{skill.name}</li>)}
    </ul>}
  </form>;
}
