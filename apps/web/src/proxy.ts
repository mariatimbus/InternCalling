import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicAuthConfig } from "@/lib/auth/server-config";
import { isAuthNetworkError } from "@/lib/auth/config";
import { trustedRecoveryOrigin } from "@/lib/auth/recovery";

/** Refresh provider cookies before rendering. Redirect responses retain every refreshed/removed cookie. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const cacheHeaders: Record<string, string> = { "Cache-Control": "private, no-store, max-age=0, must-revalidate", Pragma: "no-cache", Expires: "0" };
  const applyHeaders = (target: NextResponse) => { Object.entries(cacheHeaders).forEach(([name, value]) => target.headers.set(name, value)); return target; };
  try {
    const config = getPublicAuthConfig();
    if (!config) return applyHeaders(response);
    const supabase = createServerClient(config.url, config.key, {
      ...(request.nextUrl.pathname === "/reset-password" ? { cookieOptions: { name: "interncalling-recovery", httpOnly: true, sameSite: "lax" as const, secure: trustedRecoveryOrigin(process.env.AUTH_APP_ORIGIN).startsWith("https:"), path: "/" } } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(changes, headers) {
          for (const change of changes) { request.cookies.set(change.name, change.value); pending.set(change.name, change); }
          Object.assign(cacheHeaders, headers);
          response = NextResponse.next({ request });
          for (const { name, value, options } of pending.values()) response.cookies.set(name, value, options);
        },
      },
    });
    const { data, error } = await supabase.auth.getUser();
    const protectedPath = /^\/(jobs|profile|applications|settings|onboarding)(\/|$)/.test(request.nextUrl.pathname);
    if (protectedPath && !data.user && !isAuthNetworkError(error)) {
      const redirect = NextResponse.redirect(new URL("/sign-in", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return applyHeaders(redirect);
    }
  } catch { /* The server gate renders a safe unavailable state; never render protected children on failure. */ }
  return applyHeaders(response);
}

export const config = { matcher: ["/jobs/:path*", "/profile/:path*", "/applications/:path*", "/settings/:path*", "/onboarding/:path*", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/auth/:path*"] };
