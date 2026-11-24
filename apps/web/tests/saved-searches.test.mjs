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
const lib = await import(await moduleUrl("../src/lib/saved-searches.ts", { '"./api/client"': JSON.stringify(clientUrl) }));
const id = "00000000-0000-4000-8000-000000000001";
const form = (values) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const api = () => { const calls = []; return { calls, async request(path, init) { calls.push({ path, ...init }); } }; };

test("names and links rebuild the same Jobs search", () => {
  const fields = { search: " python ", location: "Berlin", degree: "master", year: "2" };
  assert.equal(lib.searchName(fields), "python · Berlin · Master's · Year 2");
  const saved = { id, name: "x", search: "python", location: "Berlin", degree_level: "master", study_year: 2, alert: false };
  assert.equal(lib.searchHref(saved), "/jobs?view=recommended&q=python&page=1&location=Berlin&degree_level=master&study_year=2");
  assert.equal(lib.isSaved([saved], fields), true);
  assert.equal(lib.isSaved([saved], { ...fields, year: "" }), false);
});

test("save, alert and remove send exactly what the API expects", async () => {
  const client = api();
  await lib.changeSavedSearch(client, form({ intent: "save", q: "react", location: "", degree_level: "phd", study_year: "9" }));
  await lib.changeSavedSearch(client, form({ intent: "alert", id, alert: "true" }));
  await lib.changeSavedSearch(client, form({ intent: "remove", id }));
  assert.deepEqual(client.calls, [
    { path: "/api/v1/saved-searches", method: "POST", body: { name: "react", search: "react", location: null, degree_level: null, study_year: null } },
    { path: `/api/v1/saved-searches/${id}`, method: "PATCH", body: { alert: true } },
    { path: `/api/v1/saved-searches/${id}`, method: "DELETE" },
  ]);
});

test("empty searches and bad ids never reach the API", async () => {
  for (const values of [{ intent: "save" }, { intent: "alert", id: "../profile" }, { intent: "rename", id }]) {
    const client = api();
    await assert.rejects(lib.changeSavedSearch(client, form(values)), ApiError);
    assert.equal(client.calls.length, 0);
  }
});
