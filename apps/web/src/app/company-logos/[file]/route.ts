import { logoDomain } from "@/lib/company-logo";

// Fetched server-side and cached by the CDN, so a student's browser only ever talks to
// this site: no third-party request reveals who looks at which company.
const ICONS = "https://www.google.com/s2/favicons";
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "image/gif"]);
const MAX_BYTES = 200_000;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const domain = logoDomain((await params).file);
  if (!domain) return missing();
  let upstream: Response;
  try {
    const options = { signal: AbortSignal.timeout(5000), cache: "no-store" as const };
    upstream = await fetch(`${ICONS}?domain=${encodeURIComponent(domain)}&sz=128`, options);
    if (upstream.status === 404 && !domain.startsWith("www.")) {
      upstream = await fetch(`${ICONS}?domain=www.${encodeURIComponent(domain)}&sz=128`, options);
    }
  } catch { return missing(); }
  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // No SVG: served from this origin it could carry script.
  if (!upstream.ok || !TYPES.has(type)) return missing();
  const body = await upstream.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return missing();
  return new Response(body, { headers: {
    "Content-Type": type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
    "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
  } });
}
