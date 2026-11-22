import "server-only";
import { publicAuthConfig } from "./config";

/** Server-only environment access; only validated public configuration is sent to the browser. */
export function getPublicAuthConfig() {
  const environment = process.env;
  return publicAuthConfig(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getApiBaseUrl() {
  const environment = process.env;
  const value = environment.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) throw new Error("The application API is not configured.");
  return value;
}
