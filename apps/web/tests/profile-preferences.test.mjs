import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/profile-preferences.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { readPreferences } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("preferences whitelist fields, preserve unknowns and normalize lists", () => {
  const form = new FormData();
  form.set("interests", " AI, research, AI "); form.set("user_id", "someone-else");
  const result = readPreferences(form);
  assert.deepEqual(result.interests, ["AI", "research"]);
  assert.equal(result.study_year, null); assert.equal(result.remote_preferred, null);
  assert.equal("user_id" in result, false);
  form.set("study_year", "third"); form.set("remote_preferred", "false");
  assert.equal(readPreferences(form).remote_preferred, false);
  assert.equal(readPreferences(form).study_year, "third");
});
test("preferences reject invalid year, remote choice, oversized lists and entries", () => {
  for (const [name, value] of [["study_year", "seventh"], ["remote_preferred", "yes"],
    ["interests", "x".repeat(101)], ["preferred_locations", Array.from({length: 51}, (_, i) => `City ${i}`).join(",")]]) {
    const form = new FormData(); form.set(name, value); assert.throws(() => readPreferences(form));
  }
});
