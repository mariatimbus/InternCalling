import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/job-description.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { structureDescription } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("headings, bullets and paragraphs from an ingested description", () => {
  const text = [
    "We build developer tools used by millions.",
    "ABOUT THE ROLE",
    "You will join the platform team in Berlin.",
    "What you'll do:",
    "• Build internal APIs in Go",
    "• Improve CI reliability",
    "Requirements",
    "- Python or Go",
    "1. Enrolled in a CS degree",
  ].join("\n");
  assert.deepEqual(structureDescription(text), [
    { kind: "paragraph", text: "We build developer tools used by millions." },
    { kind: "heading", text: "About the role" },
    { kind: "paragraph", text: "You will join the platform team in Berlin." },
    { kind: "heading", text: "What you'll do" },
    { kind: "list", items: ["Build internal APIs in Go", "Improve CI reliability"] },
    { kind: "heading", text: "Requirements" },
    { kind: "list", items: ["Python or Go", "Enrolled in a CS degree"] },
  ]);
});

test("sentences, links and a trailing title are never headings", () => {
  assert.deepEqual(structureDescription("Apply by Friday.\nOfficial source: https://example.com/job\nBENEFITS"), [
    { kind: "paragraph", text: "Apply by Friday." },
    { kind: "paragraph", text: "Official source: https://example.com/job" },
    { kind: "paragraph", text: "Benefits" },
  ]);
  assert.deepEqual(structureDescription(""), []);
});

test("card snippets skip headings and source notes", async () => {
  const { descriptionSnippet } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  assert.equal(descriptionSnippet("ABOUT US\nWe make maps.\nMore."), "We make maps.");
  assert.equal(descriptionSnippet("Responsibilities:\n• Ship code\n• Write tests"), "Ship code · Write tests");
  assert.equal(descriptionSnippet(null), "");
});
