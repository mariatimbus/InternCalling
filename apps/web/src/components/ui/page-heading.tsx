import type { ReactNode } from "react";

/** Consistent page heading for workspace sections. Actions, when present, remain caller-owned. */
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div>{action}</header>;
}
