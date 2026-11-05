import type { ReactNode } from "react";

/** Caller supplies a safe error message and retry action; no raw server errors. @example <ErrorState title="Jobs could not be loaded" /> */
export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div role="alert" className="rounded-card border border-border bg-surface p-6"><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-2 text-sm text-muted">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
