import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
export type CollectionState<T> = { kind: "unconnected" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; entries: T[] };
export function CollectionView<T extends { id: string }>({ state, renderEntry, onRetry, emptyMessage = "No experience entries yet." }: { state: CollectionState<T>; renderEntry: (entry: T) => ReactNode; onRetry: () => void; emptyMessage?: string }) {
  if (state.kind === "unconnected") return <p className="text-sm leading-6 text-muted">This section is not connected yet. You can draft an entry, but saving is unavailable. Drafts are lost when you leave or reload.</p>;
  if (state.kind === "loading") return <p role="status" className="text-sm">Loading entries...</p>;
  if (state.kind === "error") return <div role="alert"><p className="text-sm">{state.message}</p><Button variant="secondary" onClick={onRetry}>Retry loading</Button></div>;
  if (!state.entries.length) return <p className="text-sm text-muted">{emptyMessage}</p>;
  return <ul className="space-y-5">{state.entries.map(entry => <li key={entry.id} className="min-w-0 rounded-card border border-border p-4">{renderEntry(entry)}</li>)}</ul>;
}
