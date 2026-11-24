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
const { decideReview } = await import(await moduleUrl("../src/lib/review.ts", { '"./api/client"': JSON.stringify(clientUrl) }));
const id = "00000000-0000-4000-8000-000000000001";
const form = (values) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const api = (fail) => { const calls = []; return { calls, async request(path, init) { calls.push({ path, ...init }); if (fail) throw fail; } }; };

test("a decision posts to the reviewed posting", async () => {
  const client = api();
  await decideReview(client, form({ id, decision: "approve" }));
  assert.deepEqual(client.calls, [{ path: `/api/v1/review/opportunities/${id}`, method: "POST", body: { decision: "approve" } }]);
});

test("invalid input never reaches the API", async () => {
  for (const values of [{ id: "../profile", decision: "approve" }, { id, decision: "delete" }, {}]) {
    const client = api();
    await assert.rejects(decideReview(client, form(values)), ApiError);
    assert.equal(client.calls.length, 0);
  }
});

test("a posting already decided elsewhere is not an error; other failures are", async () => {
  await decideReview(api(new ApiError(409, "conflict")), form({ id, decision: "reject" }));
  await assert.rejects(decideReview(api(new ApiError(403, "forbidden")), form({ id, decision: "reject" })), ApiError);
});
