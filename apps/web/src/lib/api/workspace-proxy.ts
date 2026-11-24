/** Same-origin, bounded proxy. Browser cookies never become backend identity claims. */
const UUID = "[0-9a-fA-F-]{36}";
const sections = "(?:experience|projects|certificates|honours|languages|publications)";
const routes: Record<string, RegExp[]> = {
  GET: [/^workspace\/(?:capabilities|snapshot|resume)$/, new RegExp(`^workspace/collections/${sections}$`),
    new RegExp(`^workspace/resume/${UUID}/file$`), new RegExp(`^workspace/resume/review/${UUID}(?:/result)?$`),
    new RegExp(`^workspace/tailoring/(?:context|generation)/${UUID}$`), new RegExp(`^workspace/tailoring/export/${UUID}(?:/file)?$`)],
  POST: [/^workspace\/(?:resume|manual-confirm)$/, new RegExp(`^workspace/collections/${sections}$`),
    /^workspace\/resume\/review\/(?:start|confirm)$/, /^workspace\/tailoring\/(?:generate|save|approve|export)$/],
  PATCH: [new RegExp(`^workspace/collections/${sections}/${UUID}$`)],
  DELETE: [new RegExp(`^workspace/collections/${sections}/${UUID}$`), new RegExp(`^workspace/resume/${UUID}$`)],
};
function failure(status: number, code: string) {
  return Response.json({ error: { code, message: "The operation could not be confirmed. Reload or retry the same request." } },
    { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
async function boundedBody(request: Pick<Request, "headers" | "body">, limit: number) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function workspaceProxy(request: Request, path: string[], dependencies: {
  baseUrl: string; configuredOrigin?: string; token: () => Promise<string | null>;
  transport?: typeof fetch;
}) {
  const joined = path.join("/"); const method = request.method;
  if (!path.every(part => /^[A-Za-z0-9_-]+$/.test(part)) || !routes[method]?.some(route => route.test(joined))) return failure(404, "not_found");
  try {
    const incoming = new URL(request.url); const base = new URL(dependencies.baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") return failure(503, "configuration");
    if (method !== "GET") {
      const expected = dependencies.configuredOrigin ? new URL(dependencies.configuredOrigin).origin : incoming.origin;
      if (!request.headers.get("origin") || request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") return failure(403, "invalid_origin");
    }
    const query = incoming.searchParams;
    const keys = [...query.keys()];
    if (new Set(keys).size !== keys.length || keys.some(key => !["revision", "replace_id", "replace_revision"].includes(key))) return failure(400, "invalid_query");
    for (const [key, value] of query) {
      if (key === "replace_id" ? !new RegExp(`^${UUID}$`).test(value) : !/^[1-9]\d{0,8}$/.test(value)) return failure(400, "invalid_query");
    }
    const token = await dependencies.token();
    if (!token) return failure(401, "unauthorized");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json, application/pdf" };
    const key = request.headers.get("idempotency-key");
    if (key) {
      if (!new RegExp(`^${UUID}$`).test(key)) return failure(400, "invalid_request_id");
      headers["Idempotency-Key"] = key;
    }
    let body: Uint8Array | undefined;
    if (["POST", "PATCH"].includes(method)) {
      const pdf = joined === "workspace/resume";
      const contentType = request.headers.get("content-type")?.split(";")[0].trim();
      if (contentType !== (pdf ? "application/pdf" : "application/json")) return failure(415, "unsupported_media_type");
      const bytes = await boundedBody(request, pdf ? 5 * 1024 * 1024 : 1024 * 1024);
      if (!bytes) return failure(413, "body_too_large");
      body = bytes; headers["Content-Type"] = contentType;
    }
    const target = new URL("/api/v1/" + path.map(encodeURIComponent).join("/"), base);
    target.search = query.toString();
    const response = await (dependencies.transport ?? fetch)(target, { method, headers,
      ...(body ? { body: body as BodyInit } : {}), redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]) });
    if (!response.ok) {
      let code = "upstream_error";
      try { const value = await response.json(); if (/^[a-z_]{1,60}$/.test(value?.error?.code)) code = value.error.code; } catch { /* Never forward upstream HTML/errors. */ }
      return failure(response.status >= 400 && response.status <= 599 ? response.status : 502, code);
    }
    if (response.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    const type = response.headers.get("content-type")?.split(";")[0];
    if (type !== "application/json" && type !== "application/pdf") return failure(502, "invalid_response");
    // Finish a bounded private read before responding; an aborted upstream stream
    // must not become an uncaught downstream response-stream error.
    const bytes = await boundedBody(response, type === "application/pdf" ? 20 * 1024 * 1024 : 16 * 1024 * 1024);
    if (!bytes) return failure(502, "invalid_response");
    return new Response(bytes as BodyInit, { status: response.status, headers: {
      "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      ...(type === "application/pdf" ? { "Content-Disposition": 'inline; filename="resume.pdf"' } : {}),
    } });
  } catch { return failure(503, "service_unavailable"); }
}
