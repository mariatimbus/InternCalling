"use client";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createBrowserSupabaseClient } from "@/lib/auth/supabase-browser";
import type { PublicAuthConfig } from "@/lib/auth/config";
const AuthConfiguration = createContext<PublicAuthConfig | null>(null);
export function useAuthConfiguration() { return useContext(AuthConfiguration); }
/** The server authorizes requests. Conceal stale private content on sign-out or history restoration. */
export function AuthBoundary({ config, userId, children }: { config: PublicAuthConfig; userId: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    function conceal() { if (content.current) content.current.hidden = true; if (status.current) status.current.hidden = false; }
    const { data } = createBrowserSupabaseClient(config).auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) { conceal(); window.location.replace("/sign-in"); }
      else if (session && session.user.id !== userId) { conceal(); window.location.replace("/jobs"); }
    });
    function restore(event: PageTransitionEvent) { if (event.persisted) { conceal(); window.location.reload(); } }
    window.addEventListener("pagehide", conceal); window.addEventListener("pageshow", restore);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("pagehide", conceal); window.removeEventListener("pageshow", restore); };
  }, [config, userId]);
  return <AuthConfiguration value={config}><div ref={content}>{children}</div><p hidden ref={status} role="status" className="p-10 text-muted">Checking your session…</p></AuthConfiguration>;
}
