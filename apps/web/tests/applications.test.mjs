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
const clientUrl = await moduleUrl("../src/lib/api/client.ts");
const { ApiError } = await import(clientUrl);
const { changeTracking } = await import(await moduleUrl("../src/lib/applications.ts", { '"./api/client"': JSON.stringify(clientUrl) }));
const opportunity = "00000000-0000-4000-8000-000000000001";
function form(intent, extra = {}) { const data = new FormData(); for (const [key, value] of Object.entries({ intent, opportunity_id: opportunity, ...extra })) data.set(key, value); return data; }
function fixture() {
  let items = []; const calls = [];
  return { calls, get items() { return items; }, async request(path, init = {}) {
    calls.push({ path, ...init });
    if (!init.method) return { items: structuredClone(items) };
    if (init.method === "POST") { const app = { id: "application-test", ...init.body, notes: null }; items.push(app); return structuredClone(app); }
    if (init.method === "PATCH") { items[0] = { ...items[0], ...init.body }; return structuredClone(items[0]); }
    if (init.method === "DELETE") { items = []; return; }
  } };
}
test("save, apply, all statuses, notes and remove use canonical server records", async () => {
  const api = fixture();
  assert.equal((await changeTracking(api, form("save"))).application.status, "saved");
  assert.equal((await changeTracking(api, form("apply"))).application.status, "applied");
  for (const status of ["interview", "offer", "rejected"]) {
    const result = await changeTracking(api, form("update", { status, notes: " Interview notes " }));
    assert.equal(result.application.status, status); assert.equal(result.application.notes, "Interview notes");
  }
  assert.equal((await changeTracking(api, form("save"))).application.status, "rejected");
  assert.equal(api.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal((await changeTracking(api, form("remove"))).application, null);
  assert.deepEqual(api.items, []);
});
test("invalid edits cannot make API calls", async () => {
  const api = fixture();
  for (const data of [form("update", { status: "invalid" }), form("save", { opportunity_id: "bad" }), form("update", { status: "offer", notes: "x".repeat(10001) })]) assert.ok((await changeTracking(api, data)).error);
  assert.equal(api.calls.length, 0);
});
test("404/422/network failures preserve confirmed state without false success", async () => {
  for (const status of [404, 422, 503]) {
    const api = fixture(); await changeTracking(api, form("save"));
    const original = api.request.bind(api);
    api.request = (path, init) => init?.method ? Promise.reject(new ApiError(status, "test")) : original(path, init);
    const result = await changeTracking(api, form("update", { status: "offer" }));
    assert.ok(result.error); assert.equal(result.message, ""); assert.equal(result.application.status, "saved");
  }
});
test("concurrent save conflict rereads canonical data", async () => {
  let count = 0;
  const saved = { id: "canonical-id", opportunity_id: opportunity, status: "saved" };
  const api = { async request(_path, init) {
    if (init?.method === "POST") throw new ApiError(409, "duplicate");
    return { items: ++count === 1 ? [] : [saved] };
  } };
  const result = await changeTracking(api, form("save"));
  assert.ok(result.error); assert.equal(result.application.id, "canonical-id"); assert.equal(count, 2);
});
