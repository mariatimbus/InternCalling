import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getPublicAuthConfig } from "./server-config";
import { hasRecoveryClaims, trustedRecoveryOrigin } from "./recovery";

export function getRecoveryOrigin() {
  return trustedRecoveryOrigin(process.env.AUTH_APP_ORIGIN);
}

/** SDK-owned recovery session and PKCE verifier; never shares the ordinary sign-in cookie. */
export async function createRecoveryClient(writable = false, deferred = false) {
  const config = getPublicAuthConfig();
  if (!config) throw new Error("Authentication is not configured.");
  const jar = await cookies();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { name: "interncalling-recovery", httpOnly: true, sameSite: "lax", secure: getRecoveryOrigin().startsWith("https:"), path: "/" },
    cookies: {
      getAll() {
        const merged = new Map(jar.getAll().map((cookie) => [cookie.name, cookie]));
        for (const { name, value } of pending.values()) merged.set(name, { name, value });
        return [...merged.values()];
      },
      setAll(changes) {
        for (const change of changes) {
          pending.set(change.name, change);
          if (!deferred) {
            try { jar.set(change.name, change.value, change.options); }
            catch (error) { if (writable) throw error; }
          }
        }
      },
    },
  });
  return { client, commitCookies() {
    for (const { name, value, options } of pending.values()) jar.set(name, value, options);
  } };
}

export async function hasRecoverySession() {
  try {
    const { client } = await createRecoveryClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return false;
    const verified = await client.auth.getClaims();
    return !verified.error && hasRecoveryClaims(verified.data?.claims, data.user.id);
  } catch { return false; }
}
