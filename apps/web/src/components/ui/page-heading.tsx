import type { ReactNode } from "react";

/** Consistent page heading for workspace sections. Actions, when present, remain caller-owned. */
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p></div>{action}</header>;
}
