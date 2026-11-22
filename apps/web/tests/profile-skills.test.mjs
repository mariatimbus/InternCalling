import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, exports);
  return exports;
}
const helpers = await load("../src/lib/profile-skills.ts");
const { ApiError } = await load("../src/lib/api/client.ts");
const initial = [{ id: "python-id", name: "python" }];

async function actions(options = {}) {
  let selected = structuredClone(options.skills ?? initial), reads = 0;
  const calls = [], invalidated = [];
  const account = { kind: "ready", api: { request: async (path, init = {}) => {
    calls.push({ path, ...init });
    if (path === "/api/v1/skills") {
      if (options.catalogError) throw new ApiError(503, "offline");
      return options.catalog ?? initial;
    }
    if (!init.method) {
      reads++;
      if (options.readError || (options.refreshError && reads > 1)) throw new ApiError(503, "offline");
      return options.malformed ? [{ id: 123, name: null }] : structuredClone(selected);
    }
    if (options.mutationError) throw options.mutationError;
    if (init.method === "POST") selected.push({ id: "custom-id", name: init.body.name });
    if (init.method === "DELETE") selected = selected.filter((skill) => skill.name !== decodeURIComponent(path.split("/").at(-1)));
    if (init.method === "PUT") selected = selected.filter((skill) => init.body.names.includes(skill.name));
    // Mutation responses deliberately differ: caller must use the following authoritative GET.
    return [{ id: "unconfirmed", name: "unconfirmed response" }];
  } } };
  const api = await load("../src/app/(workspace)/profile/skills-actions.ts", {
    "next/cache": { revalidatePath: (path) => invalidated.push(path) },
    "@/lib/auth/account": { getAccountState: async () => options.state ?? account },
    "@/lib/api/client": { ApiError },
    "@/lib/profile-skills": helpers,
  });
  return { api, calls, invalidated, selected: () => selected };
}

test("suggestions filter the full array case-insensitively, exclude selected, deduplicate and cap at ten", () => {
  const catalog = [{ id: "p", name: "PYTHON" }, ...Array.from({ length: 15 }, (_, i) => ({ id: String(i), name: "Skill " + i })), { id: "duplicate", name: "SKILL 0" }];
  const result = helpers.skillSuggestions(catalog, initial, " sKiLl ");
  assert.equal(result.length, 10);
  assert.equal(result[0].name, "Skill 0");
  assert.equal(helpers.skillSuggestions(catalog, initial, "python").length, 0);
  assert.deepEqual(helpers.skillSuggestions(catalog, [], "not present"), []);
});

test("custom names follow API trim/lowercase and 1-100 character rules", () => {
  assert.deepEqual(helpers.validateSkillName("  TypeScript  "), { name: "typescript" });
  assert.deepEqual(helpers.validateSkillName("CI/CD"), { name: "ci/cd" });
  for (const value of [null, "", "   ", "x".repeat(101)]) assert.ok(helpers.validateSkillName(value).error);
  assert.ok(helpers.validateSkillName("x".repeat(100)).name);
});

test("suggestions request exactly GET /skills without search parameters", async () => {
  const state = await actions();
  assert.deepEqual((await state.api.getSkillSuggestions()).skills, initial);
  assert.deepEqual(state.calls, [{ path: "/api/v1/skills" }]);
});

test("add uses normalized POST and confirms through a fresh GET before returning skills", async () => {
  const state = await actions();
  const result = await state.api.addProfileSkill("  React  ");
  assert.deepEqual(state.calls.map((call) => call.method ?? "GET"), ["GET", "POST", "GET"]);
  assert.deepEqual(state.calls[1], { path: "/api/v1/profile/skills", method: "POST", body: { name: "react" } });
  assert.deepEqual(result.skills.map((skill) => skill.name), ["python", "react"]);
  assert.deepEqual(state.invalidated, ["/profile", "/jobs"]);
});

test("duplicate add and already-removed skill return current backend state without another mutation", async () => {
  const state = await actions();
  assert.match((await state.api.addProfileSkill(" PYTHON ")).success, /already/);
  assert.match((await state.api.removeProfileSkill("missing")).success, /already/);
  assert.equal(state.calls.filter((call) => call.method).length, 0);
});

test("remove encodes ordinary names and confirms persistence without replacing other skills", async () => {
  const state = await actions({ skills: [...initial, { id: "c", name: "c++" }] });
  const result = await state.api.removeProfileSkill(" C++ ");
  assert.equal(state.calls[1].path, "/api/v1/profile/skills/c%2B%2B");
  assert.equal(state.calls[1].method, "DELETE");
  assert.deepEqual(result.skills, initial);
  assert.deepEqual(state.invalidated, ["/profile", "/jobs"]);
});

test("slash-containing names use the existing replacement endpoint with the freshly read remainder", async () => {
  const state = await actions({ skills: [...initial, { id: "ci", name: "ci/cd" }] });
  assert.deepEqual((await state.api.removeProfileSkill("CI/CD")).skills, initial);
  assert.deepEqual(state.calls[1], { path: "/api/v1/profile/skills", method: "PUT", body: { names: ["python"] } });
});

test("failed mutations and failed confirmation reads never return an optimistic skill list", async () => {
  for (const options of [{ mutationError: new ApiError(503, "test") }, { refreshError: true }]) {
    const state = await actions(options);
    const result = await state.api.addProfileSkill("react");
    assert.ok(result.error);
    assert.equal(result.skills, undefined);
    if (options.refreshError) assert.deepEqual(state.invalidated, ["/profile", "/jobs"]);
    else assert.deepEqual(state.selected(), initial);
  }
});

test("catalog/read/malformed/session failures and invalid names are safe and do not mutate", async () => {
  const offline = await actions({ catalogError: true });
  assert.match((await offline.api.getSkillSuggestions()).error, /custom/);
  for (const options of [{ readError: true }, { malformed: true }, { state: { kind: "guest" } }, { state: { kind: "unavailable" } }]) {
    const state = await actions(options);
    assert.ok((await state.api.addProfileSkill("react")).error);
    assert.equal(state.calls.filter((call) => call.method).length, 0);
  }
  const invalid = await actions();
  assert.ok((await invalid.api.addProfileSkill(" ")).error);
  assert.equal(invalid.calls.length, 0);
});

test("API errors give useful safe messages and allow a later retry", async () => {
  for (const status of [401, 403, 422, 429, 500]) {
    const state = await actions({ mutationError: new ApiError(status, "private upstream details") });
    const result = await state.api.removeProfileSkill("python");
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /private upstream/);
    assert.equal(result.skills, undefined);
  }
});

test("slash-name fallback respects the existing replace API's 100-name limit without dropping skills", async () => {
  const skills = [...Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: "skill " + i })), { id: "ci", name: "ci/cd" }];
  const state = await actions({ skills });
  const result = await state.api.removeProfileSkill("ci/cd");
  assert.match(result.error, /100 skills/);
  assert.equal(state.calls.filter((call) => call.method).length, 0);
  assert.deepEqual(state.selected(), skills);
});
