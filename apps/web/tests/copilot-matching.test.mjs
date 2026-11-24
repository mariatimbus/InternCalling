import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, exports);
  return exports;
}
const model = await load("../src/lib/opportunity-copilot.ts", {
  "./match-reasons": await load("../src/lib/match-reasons.ts"),
});

test("Copilot preserves matching v2 fit, gaps, recency and requirement discounts", () => {
  const fit = ["Matches 2 of 4 skills: python, sql", "Software role fits your background", "Posted this week"];
  const gap = "Also asks for: docker";
  const note = "Some requirements are not stated in the posting";
  const { match } = model.prepareOpportunityCopilot({
    match: { score: 72, reasons: [...fit, gap, note], components: { skills: 20, field_fit: 25, recency: 5, ai: 0 } },
    eligibility: null,
  }, [], []);
  assert.equal(match.score, 72);
  assert.deepEqual(match.positiveReasons, fit);
  assert.deepEqual(match.gaps, [gap]);
  assert.equal(match.note, note);
  assert.deepEqual(match.components, [{ label: "Skills", points: 20 }, { label: "Role fit", points: 25 }, { label: "Recently posted", points: 5 }]);
});
