/** Text-based company identity for listings without a supplied logo. No external logo requests. */
export function CompanyMark({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-control bg-accent/10 font-semibold tracking-tight text-accent ${size === "sm" ? "size-10 text-sm" : "size-12 text-lg"}`}>
      {initials}
    </span>
  );
}
