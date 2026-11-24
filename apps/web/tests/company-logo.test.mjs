import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path, replace = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replace)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const helperUrl = await moduleUrl("../src/lib/company-logo.ts");
const { companyLogoUrl, logoDomain } = await import(helperUrl);
const { GET } = await import(await moduleUrl("../src/app/company-logos/[file]/route.ts", { '"@/lib/company-logo"': JSON.stringify(helperUrl) }));
const call = (file) => GET(new Request("http://site.test/company-logos/" + file), { params: Promise.resolve({ file }) });

test("only plain domains become logo paths", () => {
  assert.equal(companyLogoUrl("stripe.com"), "/company-logos/stripe.com.png");
  assert.equal(companyLogoUrl("deliveroo.co.uk"), "/company-logos/deliveroo.co.uk.png");
  for (const bad of [null, "", "localhost", "evil.com/../x", "a b.com", "Stripe.com", "x".repeat(98) + ".com"]) assert.equal(companyLogoUrl(bad), null);
  assert.equal(logoDomain("stripe.com.png"), "stripe.com");
  assert.equal(logoDomain("stripe.com.svg"), null);
});

test("the route serves cached raster icons and refuses everything else", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  const requested = [];
  let reply = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  globalThis.fetch = async (url) => { requested.push(String(url)); return reply(); };

  const ok = await call("stripe.com.png");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.match(ok.headers.get("cache-control"), /s-maxage=2592000/);
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.equal(requested[0], "https://www.google.com/s2/favicons?domain=stripe.com&sz=128");

  assert.equal((await call("..%2Fetc.png")).status, 404);
  assert.equal(requested.length, 1, "invalid names never reach the network");
  reply = () => new Response("<svg onload=alert(1)>", { headers: { "content-type": "image/svg+xml" } });
  assert.equal((await call("evil.com.png")).status, 404);
  reply = () => new Response("", { status: 404, headers: { "content-type": "image/png" } });
  assert.equal((await call("unknown-company.com.png")).status, 404);
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal((await call("stripe.com.png")).status, 404);
});
