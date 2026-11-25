"use client";
import { useId } from "react";
import { useRouter } from "next/navigation";

const options = [["", "Best match"], ["recent", "Most recent"], ["deadline", "Deadline soonest"], ["company", "Company A–Z"]] as const;

/** Re-sorts Recommended without touching the search or filters; always back to page 1. */
export function SortSelect({ sort, params }: { sort: string; params: string }) {
  const router = useRouter();
  const id = useId();
  return <div className="ms-auto flex items-center gap-2 text-sm">
    <label htmlFor={id} className="text-muted">Sort by</label>
    <select id={id} value={sort} onChange={(event) => {
      const next = new URLSearchParams(params);
      if (event.target.value) next.set("sort", event.target.value); else next.delete("sort");
      next.set("page", "1");
      router.push("/jobs?" + next);
    }} className="min-h-10 rounded-control border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {options.map(([value, label]) => <option key={value || "match"} value={value}>{label}</option>)}
    </select>
  </div>;
}
