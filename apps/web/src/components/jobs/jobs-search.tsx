"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Filters = { location: string; degree_level: string; study_year: string };

const suggestions = [
  { label: "Software Engineering", query: "software", aliases: ["swe", "software developer", "frontend", "backend"] },
  { label: "AI / ML", query: "machine learning", aliases: ["ai", "ml", "artificial intelligence"] },
  { label: "Data", query: "data", aliases: ["data science", "analytics", "data engineering"] },
  { label: "Cybersecurity", query: "cybersecurity", aliases: ["cyber", "security", "infosec"] },
  { label: "Quant", query: "quant", aliases: ["quantitative", "quant finance"] },
  { label: "Robotics", query: "robotics", aliases: ["robot", "automation"] },
  { label: "Embedded Systems Engineering", query: "embedded", aliases: ["firmware", "microcontroller", "embedded software"] },
];

const studyOptions = [
  ["bachelor:1", "Undergraduate first year"],
  ["bachelor:2", "Undergraduate second year"],
  ["bachelor:3", "Undergraduate third year"],
  ["bachelor:4", "Undergraduate fourth year"],
  ["master:1", "Master’s first year"],
  ["master:2", "Master’s second year"],
] as const;
const degreeOptions = [
  ["bachelor:", "Any undergraduate year"],
  ["master:", "Any master’s year"],
  ["both:", "Both degree levels"],
] as const;
const degreeLabels: Record<string, string> = { bachelor: "Undergraduate", master: "Master’s", both: "Both degree levels" };
const emptyFilters: Filters = { location: "", degree_level: "", study_year: "" };
const unavailableChoices = [
  { label: "Schedule", options: ["Full-time", "Part-time"] },
  { label: "Work Model", options: ["Remote", "Hybrid", "On-site"] },
  { label: "Date Posted", options: ["Past 24 hours", "Past 3 days", "Past week", "Past month"] },
];

export function JobsSearch({ search, applied, navigationKey }: { search: string; applied: Filters; navigationKey: string }) {
  const router = useRouter();
  const listId = useId();
  const drawerId = useId();
  const formId = useId();
  const [keyword, setKeyword] = useState(search);
  const [previousNavigation, setPreviousNavigation] = useState(navigationKey);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  if (navigationKey !== previousNavigation) {
    setPreviousNavigation(navigationKey);
    setKeyword(search);
    setShowSuggestions(false);
    setActiveIndex(-1);
    setFiltersOpen(false);
  }

  const term = keyword.trim().toLowerCase();
  const matches = term ? suggestions.map((suggestion) => {
    const names = [suggestion.label.toLowerCase(), suggestion.query, ...suggestion.aliases];
    const rank = names.some((name) => name.startsWith(term)) ? 0 : names.some((name) => name.includes(term)) ? 1 : 2;
    return { ...suggestion, rank };
  }).filter(({ rank }) => rank < 2).sort((a, b) => a.rank - b.rank).slice(0, 5) : [];
  const visible = showSuggestions && matches.length > 0;
  const appliedStudy = applied.degree_level + ":" + applied.study_year;
  const draftStudy = draft.degree_level + ":" + draft.study_year;
  const studyLabel = [...studyOptions, ...degreeOptions].find(([value]) => value === appliedStudy)?.[1]
    ?? [degreeLabels[applied.degree_level], applied.study_year && "Year " + applied.study_year].filter(Boolean).join(" · ");
  const filterCount = Number(Boolean(applied.location)) + Number(Boolean(studyLabel));

  function navigate(query: string, filters: Filters) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    for (const [name, value] of Object.entries(filters)) {
      if (value.trim()) params.set(name, value.trim());
    }
    router.push("/jobs" + (params.size ? "?" + params : ""));
  }

  function searchFor(query: string) {
    setShowSuggestions(false);
    setActiveIndex(-1);
    setKeyword(query);
    navigate(query, applied);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && visible) {
      event.preventDefault();
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
      event.preventDefault();
      setShowSuggestions(true);
      setActiveIndex((index) => {
        if (!visible || index < 0) return event.key === "ArrowDown" ? 0 : matches.length - 1;
        return (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      });
    }
    if (event.key === "Enter" && visible && matches[activeIndex]) {
      event.preventDefault();
      searchFor(matches[activeIndex].query);
    }
  }

  return <div className="mb-7 space-y-3">
    <div className="flex flex-wrap items-end gap-2.5">
      <form action="/jobs" className="flex min-w-0 flex-[1_1_17rem] flex-wrap items-end gap-2.5"
        onSubmit={(event) => { event.preventDefault(); searchFor(keyword); }}>
        <div className="relative min-w-0 flex-[1_1_9rem]">
          <Input label="Search opportunities" name="q" role="combobox" autoComplete="off" maxLength={200}
            className="bg-elevated! focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
            aria-activedescendant={visible && activeIndex >= 0 ? listId + "-" + activeIndex : undefined}
            value={keyword} onFocus={() => setShowSuggestions(true)}
            onBlur={() => { setShowSuggestions(false); setActiveIndex(-1); }}
            onChange={(event) => { setKeyword(event.target.value); setShowSuggestions(true); setActiveIndex(-1); }}
            onKeyDown={onSearchKeyDown} />
          {visible && <ul id={listId} role="listbox" aria-label="Suggested searches"
            className="absolute z-20 mt-1 w-full rounded-control border border-border bg-surface p-1 text-sm">
            {matches.map(({ label, query }, index) => <li key={query} id={listId + "-" + index} role="option"
              aria-selected={activeIndex === index} onPointerDown={(event) => event.preventDefault()} onClick={() => searchFor(query)}
              className={`cursor-pointer rounded-control px-3 py-2 hover:bg-elevated ${activeIndex === index ? "bg-elevated" : ""}`}>{label}</li>)}
          </ul>}
        </div>
        <Button type="submit">Search</Button>
      </form>
      <Button variant="secondary" aria-haspopup="dialog" aria-controls={drawerId} aria-expanded={filtersOpen}
        onClick={() => { setDraft(applied); setFiltersOpen(true); }}>
        <Icon name="sliders" className="size-4" /> Filters{filterCount > 0 && ` (${filterCount})`}
      </Button>
    </div>
    {filterCount > 0 && <div aria-label="Applied filters" className="flex flex-wrap items-center gap-2 text-sm">
      {applied.location && <Button variant="secondary" size="sm" className="max-w-full text-left"
        aria-label={`Remove location filter: ${applied.location}`}
        onClick={() => navigate(search, { ...applied, location: "" })}>
        <span className="min-w-0 [overflow-wrap:anywhere]">Location: {applied.location}</span><span aria-hidden="true">×</span>
      </Button>}
      {studyLabel && <Button variant="secondary" size="sm" className="max-w-full text-left"
        aria-label={`Remove education filter: ${studyLabel}`}
        onClick={() => navigate(search, { ...applied, degree_level: "", study_year: "" })}>
        <span className="min-w-0 [overflow-wrap:anywhere]">{studyLabel}</span><span aria-hidden="true">×</span>
      </Button>}
      <Button variant="ghost" size="sm" onClick={() => navigate(search, emptyFilters)}>Clear filters</Button>
    </div>}
    <Drawer id={drawerId} open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" size="skills"
      footer={<div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => setDraft(emptyFilters)}>Clear filters</Button>
        <Button type="submit" form={formId}>Apply filters</Button>
      </div>}>
      <form id={formId} className="min-h-0 space-y-4 overflow-y-auto px-5 pb-5"
        onSubmit={(event) => { event.preventDefault(); setFiltersOpen(false); setKeyword(search); navigate(search, draft); }}>
        <Input label="Location" maxLength={255} value={draft.location}
          onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        <Select label="Study year" value={draftStudy} onChange={(event) => {
          const [degree_level, study_year] = event.target.value.split(":");
          setDraft({ ...draft, degree_level, study_year });
        }}>
          <option value=":">Any degree or year</option>
          {appliedStudy !== ":" && ![...studyOptions, ...degreeOptions].some(([value]) => value === appliedStudy)
            && <option value={appliedStudy}>{studyLabel} (current filter)</option>}
          <optgroup label="Study year">
            {studyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </optgroup>
          <optgroup label="Degree level only">
            {degreeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </optgroup>
        </Select>
        {unavailableChoices.map(({ label, options }) => <fieldset key={label} disabled className="space-y-2 border-t border-border pt-3">
          <legend className="text-sm font-medium">{label}</legend>
          <p className="text-xs text-muted">Not available yet</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {options.map((option) => <label key={option} className="inline-flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="accent-primary" />{option}
            </label>)}
          </div>
        </fieldset>)}
        <fieldset disabled className="space-y-2 border-t border-border pt-3">
          <legend className="text-sm font-medium">Industry</legend>
          <p className="text-xs text-muted">Not available yet</p>
          <Input label="Search industries" type="search" disabled />
        </fieldset>
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-medium">Required Experience</h3>
          <p className="text-xs text-muted">Not available yet</p>
        </section>
      </form>
    </Drawer>
  </div>;
}
