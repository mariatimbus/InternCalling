"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";

export type JobFilters = { search: string; country: string; workMode: string };
export const emptyJobFilters: JobFilters = { search: "", country: "", workMode: "" };
export type FilterBarProps = { value: JobFilters; onChange: (filters: JobFilters) => void; countries: readonly string[] };

/** Controlled filters. Mobile facets use the shared drawer; the caller owns result filtering. */
export function FilterBar({ value, onChange, countries }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const facetCount = Number(Boolean(value.country)) + Number(Boolean(value.workMode));
  const hasFilters = Boolean(value.search || facetCount);
  const countryField = <Select label="Country" value={value.country} onChange={(event) => onChange({ ...value, country: event.target.value })}><option value="">All countries</option>{countries.map((country) => <option key={country}>{country}</option>)}</Select>;
  const workplaceField = <Select label="Workplace" value={value.workMode} onChange={(event) => onChange({ ...value, workMode: event.target.value })}><option value="">Any workplace</option><option>Hybrid</option><option>Remote</option><option>On-site</option></Select>;
  const clear = <Button variant="ghost" disabled={!hasFilters} onClick={() => onChange({ ...emptyJobFilters })}>Clear filters</Button>;
  return (
    <section aria-label="Filter internships" className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 py-5 lg:grid-cols-[minmax(10rem,1.6fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] lg:px-7">
      <Input type="search" label="Search internships" placeholder="Title, company or skill" value={value.search} onChange={(event) => onChange({ ...value, search: event.target.value })} />
      <div className="hidden lg:block">{countryField}</div>
      <div className="hidden lg:block">{workplaceField}</div>
      <div className="hidden lg:block">{clear}</div>
      <Button variant="secondary" className="lg:hidden" aria-expanded={open} aria-controls={drawerId} onClick={() => setOpen(true)}><Icon name="filter" /><span>Filters{facetCount > 0 && ` (${facetCount})`}</span></Button>
      <Drawer id={drawerId} title="Filters" description="Narrow your internship search." open={open} onClose={() => setOpen(false)} closeAt="(min-width: 1024px)">
        <div className="space-y-5">{countryField}{workplaceField}<div className="flex flex-wrap gap-2 pt-2"><Button onClick={() => setOpen(false)}>Show internships</Button>{clear}</div></div>
      </Drawer>
    </section>
  );
}
