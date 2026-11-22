import type { ReactNode } from "react";

/** Caller supplies a safe error message and retry action; no raw server errors. @example <ErrorState title="Jobs could not be loaded" /> */
export function ErrorState({ title, description, action, variant = "default" }: { title: string; description?: string; action?: ReactNode; variant?: "default" | "danger" }) {
  if (variant === "danger") return <div role="alert" className="flex items-start gap-3 rounded-card border-2 border-danger-border bg-danger-surface p-4 text-danger-foreground">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0"><path d="M12 3 2 21h20L12 3Z M12 9v5 M12 17h.01" /></svg>
    <div className="min-w-0 break-words"><h2 className="text-sm font-bold">{title}</h2>{description && <p className="mt-1 text-sm font-bold leading-6">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>
  </div>;
  return <div role="alert" className="rounded-card border border-border bg-surface p-6"><h2 className="section-title">{title}</h2>{description && <p className="reading-text mt-2">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
