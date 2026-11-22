import type { ReactNode } from "react";

/** Consistent page heading for workspace sections. Actions, when present, remain caller-owned. */
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">{title}</h1><p className="reading-text mt-2 max-w-xl">{description}</p></div>{action}</header>;
}
