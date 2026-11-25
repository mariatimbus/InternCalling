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

test("Copilot carries the requirement checks, plain-text fit and gaps, and the new components", () => {
  const fit = ["Matches 2 of 4 skills: python, sql", "Software role fits your background", "Posted this week"];
  const gap = "Also asks for: docker";
  const requirements = [{ key: "skills", label: "Skills", status: "partial", summary: "2 of 4 skills", matched: ["python", "sql"], missing: ["docker"], weight: 35, earned: 17.5 }];
  const { match } = model.prepareOpportunityCopilot({
    match: { score: 72, reasons: [...fit, gap], components: { skills: 18, field_fit: 20, languages: 15, ai: 0 }, requirements },
    eligibility: null,
  }, [], []);
  assert.equal(match.score, 72);
  assert.deepEqual(match.positiveReasons, fit);
  assert.deepEqual(match.gaps, [gap]);
  assert.deepEqual(match.requirements, requirements);
  assert.deepEqual(match.components, [{ label: "Skills", points: 18 }, { label: "Role fit", points: 20 }, { label: "Languages", points: 15 }]);
  const older = model.prepareOpportunityCopilot({ match: { score: 10, reasons: [], components: {} }, eligibility: null }, [], []);
  assert.deepEqual(older.match.requirements, []); // older API responses still render
});
