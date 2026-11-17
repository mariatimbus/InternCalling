"use client";

export type TopTab<Value extends string> = { value: Value; label: string; count?: number };
export type TopTabsProps<Value extends string> = { tabs: readonly TopTab<Value>[]; value: Value; onChange: (value: Value) => void; label: string; panelId: string; id: string };

/** Controlled tabs with automatic keyboard activation and a sliding capsule. Pair with a labeled tabpanel. @example <TopTabs id="jobs" panelId="jobs-panel" label="Job lists" tabs={tabs} value={value} onChange={setValue} /> */
export function TopTabs<Value extends string>({ tabs, value, onChange, label, panelId, id }: TopTabsProps<Value>) {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value));
  return (
    <div className="relative rounded-full bg-surface/80 p-1">
      <div role="tablist" aria-label={label} className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" id={`${id}-${tab.value}`} aria-selected={value === tab.value} aria-controls={panelId} tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next].value);
            document.getElementById(`${id}-${tabs[next].value}`)?.focus();
          }}
          className={`flex min-h-11 min-w-0 flex-col flex-wrap items-center justify-center gap-1 rounded-full px-2 py-3 text-sm font-medium break-words sm:flex-row sm:gap-2 ${value === tab.value ? "text-foreground" : "text-muted hover:text-foreground"}`}>
          <span className="min-w-0 [overflow-wrap:anywhere]">{tab.label}</span>{tab.count !== undefined && <span className={`min-w-5 rounded-full px-1 py-0.5 text-xs tabular-nums ${value === tab.value ? "bg-accent/10 text-accent" : "text-muted/80"}`}>{tab.count}</span>}
        </button>)}
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-elevated motion-safe:transition-transform motion-safe:duration-200" style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${activeIndex * 100}%)` }} />
    </div>
  );
}
