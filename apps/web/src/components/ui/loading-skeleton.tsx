/** Static, accessible loading placeholder; no motion required. @example <LoadingSkeleton label="Loading internships" /> */
export function LoadingSkeleton({ label = "Loading jobs", count = 3 }: { label?: string; count?: number }) {
  const rows = Math.max(1, Math.min(8, Math.floor(count) || 1));
  return <div role="status" className="space-y-3"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <div key={index} aria-hidden="true" className="space-y-4 rounded-card border border-border p-5"><div className="h-4 w-2/3 rounded-control bg-border/40" /><div className="h-3 w-1/2 rounded-control bg-border/30" /><div className="h-3 w-1/3 rounded-control bg-border/30" /></div>)}</div>;
}
