"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

export type DrawerProps = {
  id?: string;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Close when this media query matches, e.g. when desktop navigation becomes visible. */
  closeAt?: string;
  size?: "navigation" | "detail";
};

/** Controlled native modal drawer; traps focus, handles Escape and restores focus. @example <Drawer open={open} onClose={close} title="Filters">...</Drawer> */
export function Drawer({ id, open, onClose, title, description, children, closeAt, size = "navigation" }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const trigger = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : null;
    const previousOverflow = document.body.style.overflow;
    const query = closeAt ? window.matchMedia(closeAt) : null;
    if (query?.matches) { closeRef.current(); return; }
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();
    const handleResize = () => { if (query?.matches) closeRef.current(); };
    query?.addEventListener("change", handleResize);
    return () => {
      query?.removeEventListener("change", handleResize);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
      else document.getElementById("main-content")?.focus();
    };
  }, [open, closeAt]);

  return (
    <dialog ref={dialogRef} id={id} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className={`fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full rounded-l-panel bg-surface p-0 text-foreground backdrop:bg-background/75 ${size === "detail" ? "max-w-2xl" : "max-w-sm"}`}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-4 p-5">
          <div><h2 id={titleId} className="text-lg font-semibold">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm text-muted">{description}</p>}</div>
          <Button data-drawer-close variant="secondary" onClick={onClose} aria-label={`Close ${title}`}>Close</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{open && children}</div>
      </div>
    </dialog>
  );
}
