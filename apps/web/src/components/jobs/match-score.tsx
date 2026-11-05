/** A caller-supplied score, never computed here. sm suits compact cards; md suits detail headers. */
export function MatchScore({ score, size = "md" }: { score: number | null; size?: "sm" | "md" }) {
  const value = score !== null && Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : null;
  const compact = size === "sm";
  return (
    <span className="inline-flex shrink-0 items-center gap-2" aria-label={value === null ? "Match score unavailable" : `${value}% match`}>
      <span className={`relative inline-flex items-center justify-center ${compact ? "size-9" : "size-12"}`}>
        <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent/15" />
          <circle cx="22" cy="22" r="18" pathLength="100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${value ?? 0} 100`} strokeLinecap="round" className="text-accent" />
        </svg>
        <span aria-hidden="true" className={`font-semibold tabular-nums ${compact ? "text-[0.6875rem]" : "text-sm"}`}>{value ?? "—"}</span>
      </span>
      <span aria-hidden="true" className="text-xs text-muted">{compact ? "match" : "Profile match"}</span>
    </span>
  );
}
