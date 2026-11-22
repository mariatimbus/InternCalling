import { NextResponse, type NextRequest } from "next/server";
import { createRecoveryClient, getRecoveryOrigin } from "@/lib/auth/recovery-server";
import { hasRecoveryClaims, recoveryDestination } from "@/lib/auth/recovery";

export async function GET(request: NextRequest) {
  const origin = getRecoveryOrigin();
  let destination = "/reset-password?invalid=1";
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.searchParams.has("error")) {
    try {
      const recovery = await createRecoveryClient(true, true);
      const result = await recovery.client.auth.exchangeCodeForSession(code);
      destination = recoveryDestination(result);
      // Never persist a non-recovery session, even if someone routes an OAuth code here.
      if (destination === "/reset-password") {
        const verified = await recovery.client.auth.getClaims();
        if (!verified.error && result.data.user && hasRecoveryClaims(verified.data?.claims, result.data.user.id)) recovery.commitCookies();
        else destination = "/reset-password?invalid=1";
      }
    } catch { /* Expired, reused, missing-verifier and network failures are safely retryable. */ }
  }
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
