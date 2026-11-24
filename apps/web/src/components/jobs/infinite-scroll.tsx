"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type InfinitePage<T> = { items: T[]; page: number; page_size: number; total: number };
export type Pagination = { page: number; pageSize: number; total: number };

/** The parent keys each feed by its filters; unmounting retires in-flight results. */
export function useInfiniteList<T>(initialItems: T[], pagination: Pagination | undefined,
  loadPage: ((page: number) => Promise<InfinitePage<T>>) | undefined, getId: (item: T) => string) {
  const initialHasMore = !!pagination && pagination.page * pagination.pageSize < pagination.total;
  const [additional, setAdditional] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const request = useRef({ page: pagination?.page ?? 1, pending: false, active: true, hasMore: initialHasMore });
  const seen = new Set<string>();
  const items = [...initialItems, ...additional].filter((item) => {
    const id = getId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  useEffect(() => {
    const state = request.current;
    state.active = true;
    return () => { state.active = false; };
  }, []);

  const loadNext = useCallback(async () => {
    const state = request.current;
    if (!loadPage || !state.active || state.pending || !state.hasMore) return;
    state.pending = true;
    setLoading(true);
    setError(false);
    const next = state.page + 1;
    try {
      const result = await loadPage(next);
      if (!state.active) return;
      if (!Array.isArray(result.items) || result.page !== next || !Number.isInteger(result.page_size)
        || result.page_size < 1 || !Number.isInteger(result.total) || result.total < 0) throw new Error("Invalid page");
      const known = new Set(items.map(getId));
      const fresh = result.items.filter((item) => {
        const id = getId(item);
        if (known.has(id)) return false;
        known.add(id);
        return true;
      });
      state.page = next;
      state.hasMore = result.items.length > 0 && next * result.page_size < result.total && next < 10000;
      setAdditional((current) => [...current, ...fresh]);
      setHasMore(state.hasMore);
    } catch {
      if (state.active) setError(true);
    } finally {
      state.pending = false;
      if (state.active) setLoading(false);
    }
  }, [loadPage, getId, items]);

  return { items, loading, error, hasMore, loadNext };
}

export function InfiniteScrollTrigger({ loading, error, hasMore, loadNext }: {
  loading: boolean; error: boolean; hasMore: boolean; loadNext: () => Promise<void>;
}) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = target.current;
    if (!element || loading || error || !hasMore || typeof IntersectionObserver === "undefined") return;
    const main = element.closest("main");
    const root = main && /auto|scroll/.test(getComputedStyle(main).overflowY) ? main : null;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (active && entries.some((entry) => entry.isIntersecting)) void loadNext();
    }, { root, rootMargin: "300px 0px" });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [loading, error, hasMore, loadNext]);

  if (!hasMore) return null;
  return <div ref={target} aria-busy={loading} className="flex flex-col items-center gap-3 py-6 text-center">
    <p role={error ? "alert" : "status"} className="text-sm text-muted">
      {loading ? "Loading more opportunities…" : error ? "More opportunities could not be loaded. Your current results are still here." : "More opportunities available"}
    </p>
    <Button variant="secondary" disabled={loading} onClick={() => void loadNext()}>
      {error ? "Try again" : loading ? "Loading…" : "Load more opportunities"}
    </Button>
  </div>;
}
