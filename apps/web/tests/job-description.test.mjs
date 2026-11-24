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
    { kind: "heading", text: "Responsibilities" },
    { kind: "list", items: ["Build internal APIs in Go", "Improve CI reliability"] },
    { kind: "heading", text: "Qualifications" },
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

test("recognizes common listing sections followed by prose without inventing sections", () => {
  assert.deepEqual(structureDescription("Responsibilities\nBuild reliable tools for students.\nQualifications\nYou are studying computer science.\nBenefits\nFlexible working hours."), [
    { kind: "heading", text: "Responsibilities" },
    { kind: "paragraph", text: "Build reliable tools for students." },
    { kind: "heading", text: "Qualifications" },
    { kind: "paragraph", text: "You are studying computer science." },
    { kind: "heading", text: "Benefits" },
    { kind: "paragraph", text: "Flexible working hours." },
  ]);
  assert.deepEqual(structureDescription("You will benefit from experienced mentors."), [
    { kind: "paragraph", text: "You will benefit from experienced mentors." },
  ]);
});

test("card snippets skip headings and source notes", async () => {
  const { descriptionSnippet } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  assert.equal(descriptionSnippet("ABOUT US\nWe make maps.\nMore."), "We make maps.");
  assert.equal(descriptionSnippet("Responsibilities:\n• Ship code\n• Write tests"), "Ship code · Write tests");
  assert.equal(descriptionSnippet(null), "");
});

test("removes internal ATS tags consistently while preserving work-mode facts and links", async () => {
  const { descriptionSnippet } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const text = "\\#li-hybrid\n#LI-AG4\nWork in a hybrid team. #Li-Remote\nRead https://example.com/jobs#li-hybrid for details.\nC# and #opensource welcome.";
  assert.deepEqual(structureDescription(text), [
    { kind: "paragraph", text: "Work in a hybrid team." },
    { kind: "paragraph", text: "Read https://example.com/jobs#li-hybrid for details." },
    { kind: "paragraph", text: "C# and #opensource welcome." },
  ]);
  assert.equal(descriptionSnippet(text), "Work in a hybrid team.");
});

test("common employer headings use one vocabulary and previews skip recruitment labels", async () => {
  const { descriptionSnippet } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  const text = "Mission Brief\nHelp build our flight platform.\nYour tasks\n• Ship tools\nYour profile\n• Studying engineering\nWhat we offer\n• Flexible hours";
  assert.deepEqual(structureDescription(text).filter(b => b.kind === "heading").map(b => b.text), ["About the role", "Responsibilities", "Qualifications", "Benefits"]);
  assert.equal(descriptionSnippet(text), "Help build our flight platform.");
  assert.equal(descriptionSnippet("P-1601\nWe build reliable tools."), "We build reliable tools.");
  assert.equal(descriptionSnippet("IT Internship - Invoice Validation Platform\nBuild software with a small engineering team."), "Build software with a small engineering team.");
});

test("standalone bullets from scraped postings form the same list as inline bullets", () => {
  assert.deepEqual(structureDescription("Responsibilities\n•\nBuild APIs\n•\n\nWrite tests\n- Review code"), [
    { kind: "heading", text: "Responsibilities" },
    { kind: "list", items: ["Build APIs", "Write tests", "Review code"] },
  ]);
});
