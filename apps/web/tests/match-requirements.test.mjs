import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const { outputText } = ts.transpileModule(await readFile(new URL("../src/lib/match-requirements.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { requirementChips, requirementSummary } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const req = (key, status, extra = {}) => ({ key, label: key, status, summary: "", matched: [], missing: [], weight: 10, earned: 0, ...extra });
const requirements = [
  req("skills", "partial", { label: "Skills", summary: "3 of 5 skills", matched: ["python", "react", "sql"], missing: ["docker", "kafka"] }),
  req("field_fit", "met", { label: "Software role" }),
  req("languages", "missing", { label: "Languages", missing: ["German C1 — you have B2"] }),
  req("location", "met", { label: "Location", summary: "Remote", matched: ["Berlin, Remote"] }),
];

test("cards count fully met requirements out of those the posting states", () => {
  assert.deepEqual(requirementSummary(requirements), { met: 2, total: 4 });
  assert.deepEqual(requirementSummary(undefined), { met: 0, total: 0 });
});

test("chips put matches first (skills in bold), then gaps, with readable labels", () => {
  const chips = requirementChips(requirements);
  assert.deepEqual(chips.map((c) => [c.tone, c.strong.join(","), c.label]), [
    ["partial", "python,react,sql", ""],
    ["met", "", "Software role"],
    ["met", "", "Remote"],
    ["missing", "", "docker · kafka"],
    ["missing", "", "German C1"],
  ]);
  assert.equal(chips[3].title, "Also asks for: docker, kafka");
  assert.equal(requirementChips(requirements, 2).length, 2);
});
