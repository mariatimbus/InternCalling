"use client";
import { useActionState } from "react";
import { signOut } from "@/app/auth/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/auth/supabase-browser";
import { useAuthConfiguration } from "./auth-boundary";
export function SignOutButton() {
  const config = useAuthConfiguration();
  const [state, action, pending] = useActionState(async (): Promise<ActionState> => {
    if (config) {
      try {
        // The browser SDK removes its cookies and broadcasts sign-out to other tabs.
        const { error } = await createBrowserSupabaseClient(config).auth.signOut({ scope: "local" });
        if (error) return { error: "We could not sign you out. Check your connection and try again." };
      } catch { return { error: "We could not sign you out. Check your connection and try again." }; }
    }
    return signOut();
  }, {} as ActionState);
  return <form action={action}><Button type="submit" variant="ghost" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</Button>{state.error && <p role="alert" className="mt-2 text-xs leading-5">{state.error}</p>}</form>;
}
