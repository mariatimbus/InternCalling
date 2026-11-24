import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const { outputText } = ts.transpileModule(await readFile(new URL("../src/lib/match-reasons.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { topReason, isGapReason, discountNote } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("cards show the skills match first, then any other fit, never a gap or a note", () => {
  const reasons = ["Software role fits your background", "Matches 3 of 6 skills: python, react, sql", "Also asks for: docker", "Remote-friendly", "Some requirements are not stated in the posting"];
  assert.equal(topReason(reasons), "Matches 3 of 6 skills: python, react, sql");
  assert.equal(topReason(["Also asks for: docker", "Remote-friendly"]), "Remote-friendly");
  assert.equal(topReason(["None of your skills are mentioned; it asks for java", "Not eligible: degree"]), undefined);
  assert.equal(topReason(undefined), undefined);
  assert.equal(isGapReason("Also asks for: docker"), true);
  assert.equal(discountNote(reasons), "Some requirements are not stated in the posting");
});
