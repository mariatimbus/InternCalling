import type { ReactNode } from "react";
import { Icon } from "./icon";

export type EmptyStateProps = { title: string; description?: string; action?: ReactNode };

/** Calm empty result with an optional real action. @example <EmptyState title="No saved jobs yet" /> */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <div className="rounded-card border border-line bg-surface px-6 py-10 text-center sm:py-14"><span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-card bg-elevated text-accent"><Icon name="search" className="size-6" /></span><h2 className="section-title">{title}</h2>{description && <p className="page-description mx-auto">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
