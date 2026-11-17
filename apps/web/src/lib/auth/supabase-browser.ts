"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { PublicAuthConfig } from "./config";

/** Supabase manages cookies, refresh and cross-tab auth events; no custom token storage. */
export function createBrowserSupabaseClient(config: PublicAuthConfig) {
  return createBrowserClient(config.url, config.key);
}
