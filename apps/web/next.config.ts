import type { NextConfig } from "next";
import path from "node:path";
import { publicAuthConfig } from "./src/lib/auth/config";

// Reject privileged credentials before Next.js can inline public environment variables.
publicAuthConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const nextConfig: NextConfig = {
  // Shared, non-secret discovery JSON lives in database/seeds; do not duplicate it.
  turbopack: { root: path.resolve(__dirname, "../..") },
};

export default nextConfig;
