import { getVerifiedAuth } from "@/lib/auth/account";
import { getApiBaseUrl } from "@/lib/auth/server-config";
import { workspaceProxy } from "@/lib/api/workspace-proxy";
import { trustedRecoveryOrigin } from "@/lib/auth/recovery";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    return await workspaceProxy(request, (await context.params).path, {
      baseUrl: getApiBaseUrl(),
      configuredOrigin: process.env.AUTH_APP_ORIGIN ? trustedRecoveryOrigin(process.env.AUTH_APP_ORIGIN) : undefined,
      token: async () => {
        const auth = await getVerifiedAuth();
        if (auth.kind !== "signed-in") return null;
        const { data, error } = await auth.client.auth.getSession();
        return error ? null : data.session?.access_token ?? null;
      },
    });
  } catch {
    return Response.json({ error: { code: "configuration", message: "The profile service is not configured." } },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
