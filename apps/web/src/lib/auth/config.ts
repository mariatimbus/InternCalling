export type PublicAuthConfig = { url: string; key: string };

/** Accept only browser-safe provider keys. No supplied value is included in errors. */
export function publicAuthConfig(url?: string, key?: string): PublicAuthConfig | null {
  if (!url?.trim() || !key?.trim()) return null;
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { throw new Error("Invalid public Supabase URL."); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || !["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid public Supabase URL.");
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) throw new Error("Supabase requires HTTPS outside local development.");
  const value = key.trim();
  let allowed = value.startsWith("sb_publishable_");
  if (!allowed && value.split(".").length === 3) {
    try {
      const payload: unknown = JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      allowed = !!payload && typeof payload === "object" && "role" in payload && payload.role === "anon";
    } catch { allowed = false; }
  }
  if (!allowed) throw new Error("Use a Supabase publishable key or legacy anon key. Privileged keys are forbidden.");
  return { url: parsed.origin, key: value };
}

export function isAuthNetworkError(error: { status?: number; name?: string } | null | undefined) {
  return !!error && (Number(error.status) >= 500 || error.name === "AuthRetryableFetchError" || error.name === "TypeError");
}
