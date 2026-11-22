import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getPublicAuthConfig } from "./server-config";

/** New provider client per request. Proxy handles refreshes during read-only server rendering. */
export async function createServerSupabaseClient(writable = false) {
  const config = getPublicAuthConfig();
  if (!config) throw new Error("Supabase Auth is not configured.");
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(changes) {
        try { for (const { name, value, options } of changes) jar.set(name, value, options); }
        catch (error) { if (writable) throw error; }
      },
    },
  });
}

/** Failed sign-ups must not replace an outstanding confirmation link's PKCE verifier. */
export async function createDeferredSignupClient() {
  const config = getPublicAuthConfig();
  if (!config) throw new Error("Supabase Auth is not configured.");
  const jar = await cookies();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        const merged = new Map(jar.getAll().map(({ name, value }) => [name, { name, value }]));
        for (const { name, value } of pending.values()) merged.set(name, { name, value });
        return [...merged.values()];
      },
      setAll(changes) { for (const change of changes) pending.set(change.name, change); },
    },
  });
  return { client, commitCookies() {
    for (const { name, value, options } of pending.values()) jar.set(name, value, options);
    pending.clear();
  } };
}
