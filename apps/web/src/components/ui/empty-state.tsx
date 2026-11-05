import type { ReactNode } from "react";

export type EmptyStateProps = { title: string; description?: string; action?: ReactNode };

/** Calm empty result with an optional real action. @example <EmptyState title="No saved jobs yet" /> */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <div className="rounded-card border border-dashed border-border bg-surface p-6 text-center sm:p-8"><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
