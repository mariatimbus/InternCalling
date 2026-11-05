"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type DemoWorkspace = { savedIds: string[]; appliedIds: string[]; toggleSaved: (id: string) => void; markApplied: (id: string) => void };
const DemoWorkspaceContext = createContext<DemoWorkspace | null>(null);

/** Memory-only fixture state shared by preview routes. Reloading resets it. */
export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const [savedIds, setSavedIds] = useState(["canopy-backend", "pixel-product"]);
  const [appliedIds, setAppliedIds] = useState(["orbit-data"]);
  return <DemoWorkspaceContext.Provider value={{ savedIds, appliedIds,
    toggleSaved: (id) => setSavedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]),
    markApplied: (id) => setAppliedIds((current) => current.includes(id) ? current : [...current, id]),
  }}>{children}</DemoWorkspaceContext.Provider>;
}

/** Preview-only hook; never use for real saved opportunities or application tracking. */
export function useDemoWorkspace() {
  const context = useContext(DemoWorkspaceContext);
  if (!context) throw new Error("Demo workspace must be used inside DemoWorkspaceProvider.");
  return context;
}
