// Read-only production smoke checks for the hosted FastAPI backend.
// Usage: API_URL=https://api.example.com FRONTEND_ORIGIN=https://app.example.com node scripts/deploy/api-smoke.mjs
const base = new URL(process.env.API_URL ?? "");
const origin = process.env.FRONTEND_ORIGIN ?? "";
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("API_URL must be HTTPS");

async function check(name, path, init, verify) {
  const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15000), ...init });
  const problem = await verify(response);
  if (problem) throw new Error(`${name}: ${problem} (HTTP ${response.status})`);
  console.log(`ok   ${name}`);
}
const json = async (response) => { try { return await response.json(); } catch { return null; } };

await check("liveness", "/health", {}, async r => r.status === 200 && (await json(r))?.status === "ok" ? "" : "unexpected response");
await check("database", "/health/db", {}, async r => r.status === 200 ? "" : "database unreachable");
await check("public catalog", "/api/v1/opportunities?page_size=1", {}, async r => {
  const body = await json(r);
  return r.status === 200 && body && Array.isArray(body.items) ? "" : "catalog unavailable";
});
await check("auth required", "/api/v1/profile", {}, async r => r.status === 401 ? "" : "profile must require authentication");
await check("debug console disabled", "/dev/console", {}, async r => r.status === 404 ? "" : "dev console must not be exposed");
if (origin) {
  await check("CORS for frontend", "/api/v1/opportunities", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } },
    async r => r.headers.get("access-control-allow-origin") === origin ? "" : "frontend origin not allowed");
  await check("CORS rejects others", "/api/v1/opportunities", { method: "OPTIONS", headers: { Origin: "https://attacker.invalid", "Access-Control-Request-Method": "GET" } },
    async r => r.headers.get("access-control-allow-origin") ? "foreign origin allowed" : "");
}
console.log("API smoke checks passed");
