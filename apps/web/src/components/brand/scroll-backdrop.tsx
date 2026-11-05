"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Dark brand gradient follows the active scroll container, including job panes and dialogs. Reduced motion keeps it static. */
export function ScrollBackdrop() {
  const backdrop = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const element = backdrop.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let progress = 0;
    const paint = () => {
      element.style.setProperty("--scroll-progress", preference.matches ? "0" : progress.toFixed(4));
      frame = 0;
    };
    const onScroll = (event: Event) => {
      const container = event.target instanceof Element ? event.target : document.scrollingElement;
      if (!container) return;
      const range = container.scrollHeight - container.clientHeight;
      progress = range > 0 ? Math.max(0, Math.min(1, container.scrollTop / range)) : 0;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    paint();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    preference.addEventListener("change", paint);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      preference.removeEventListener("change", paint);
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return <div ref={backdrop} aria-hidden="true" className="scroll-backdrop"><div className="scroll-backdrop-shift" /></div>;
}
