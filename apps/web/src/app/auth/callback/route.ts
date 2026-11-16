import { NextResponse, type NextRequest } from "next/server";
import { isSocialProvider } from "@/lib/auth/social-providers";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
export async function GET(request: NextRequest) {
  // Node may expose its internal localhost URL. Use the incoming host so cookies stay on the requested origin.
  const origin = new URL(request.url);
  origin.host = request.headers.get("host") ?? origin.host;
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const client = await createServerSupabaseClient(true);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/jobs", origin), 303);
    } catch { /* Use a recoverable sign-in message below. */ }
  }
  const provider = request.nextUrl.searchParams.get("flow");
  const errorPath = isSocialProvider(provider) ? `/sign-in?oauth-error=${provider}` : "/sign-in?confirmation-error=1";
  return NextResponse.redirect(new URL(errorPath, origin), 303);
}
