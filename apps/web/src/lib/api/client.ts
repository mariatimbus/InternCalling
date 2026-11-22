/** Safe, status-based failures: never expose raw response bodies, tokens or upstream errors. */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(status === 401 ? "Your session could not be verified. Sign out and sign in again."
      : status === 403 ? "This account cannot access the application."
      : status === 404 ? "This record is no longer available. Refresh the page and try again."
      : status === 409 ? "This opportunity changed in another request. Refresh to see its current progress."
      : status === 429 ? "Too many requests. Wait a moment and try again."
      : status === 422 ? "Some details were not accepted. Review your answers and try again."
      : "We could not reach the application. Check your connection and try again.");
    this.name = "ApiError";
  }
}

/** One API transport for all authenticated application requests. The Supabase SDK owns token refresh. */
export function createApiClient({ baseUrl, getAccessToken, transport = fetch }: {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  transport?: typeof fetch;
}) {
  let base: URL;
  try { base = new URL(baseUrl); } catch { throw new ApiError(503, "configuration"); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new ApiError(503, "configuration");
  return {
    async request<T>(path: string, init: { method?: "GET" | "PATCH" | "PUT" | "POST" | "DELETE"; body?: unknown; authentication?: "required" | "none" } = {}): Promise<T> {
      const url = new URL(path, base);
      if (url.origin !== base.origin || !url.pathname.startsWith("/api/v1/")) throw new ApiError(400, "invalid_api_path");
      const publicRead = init.authentication === "none";
      if (publicRead && ((init.method ?? "GET") !== "GET" || !/^\/api\/v1\/(opportunities(?:\/[a-zA-Z0-9-]+)?|skills)$/.test(url.pathname))) throw new ApiError(400, "invalid_public_request");
      const token = publicRead ? null : await getAccessToken();
      if (!publicRead && !token) throw new ApiError(401, "unauthorized");
      let response: Response;
      try {
        response = await transport(url, {
          method: init.method ?? "GET", redirect: "error", cache: "no-store",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
          signal: AbortSignal.timeout(15000),
        });
      } catch { throw new ApiError(503, "network_error"); }
      if (!response.ok) throw new ApiError(response.status, "api_error");
      if (response.status === 204) return undefined as T;
      try { return await response.json() as T; }
      catch { throw new ApiError(502, "invalid_response"); }
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
