import type { NextConfig } from "next";
import { publicAuthConfig } from "./src/lib/auth/config";

// Reject privileged credentials before Next.js can inline public environment variables.
publicAuthConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
};

export default nextConfig;
