import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(file, deps = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", outputText)(name => { assert.ok(name in deps, name); return deps[name]; }, exports);
  return exports;
}
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; }
const model = await load("../src/lib/resume-pdf.ts");
const metadata = { id: "synthetic-private-pdf", revision: 2, fileName: "Student_Research_Resume.pdf", sizeBytes: 1024, contentType: "application/pdf", uploadedAt: "2026-11-24T10:00:00Z" };
const initial = { status: "ready", confirmed: null, selected: null, warning: "", busy: null, progress: null, error: "", notice: "", deleting: false, access: null };
async function fixture({ state = initial, capabilities = { upload: true, parsing: false } } = {}) {
  const values = [state, capabilities, false]; let slot = 0, ref = 0; const calls = [];
  const controller = Object.fromEntries(["load", "open", "select", "upload", "clearSelection", "requestDelete", "keepResume", "remove", "cancelUpload"].map(name => [name, (...args) => { calls.push([name, ...args]); return Promise.resolve(); }]));
  const { ResumeLibrary } = await load("../src/components/resumes/resume-library.tsx", {
    react: { useState: () => { const index = slot++; return [values[index], value => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; }, useRef: () => ({ current: ref++ === 0 ? controller : null }), useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn },
    "react/jsx-runtime": runtime,
    "@/lib/profile-services": { createProfileServices: () => ({ pdf: {} }) },
    "@/lib/resume-pdf-controller": { ResumePdfController: class {}, initialResumePdfState: () => initial },
    "@/lib/resume-pdf": model, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" },
    "@/components/ui/badge": { Badge: "Badge" },
  });
  const render = () => { slot = 0; ref = 0; return ResumeLibrary({}); };
  const button = (tree, name) => nodes(tree).find(n => n.type === "Button" && text(n) === name);
  return { render, calls, button };
}

test("authenticated Resumes page requires the account before rendering private controls", async () => {
  let checked = false;
  const { default: Page } = await load("../src/app/(workspace)/resumes/page.tsx", { "react/jsx-runtime": runtime,
    "@/lib/auth/account": { requireAccount: async () => { checked = true; } }, "@/components/resumes/resume-library": { ResumeLibrary: "ResumeLibrary" } });
  assert.ok(nodes(await Page()).some(n => n.type === "ResumeLibrary"));
  assert.equal(checked, true);
});

test("saved library renders actual metadata and delegates private file actions", async () => {
  const f = await fixture({ state: { ...initial, confirmed: metadata } }); const tree = f.render();
  assert.ok(text(tree).includes(metadata.fileName));
  for (const column of ["Resume", "Target job title", "Last modified", "Created"]) assert.ok(nodes(tree).some(n => n.type === "th" && text(n) === column));
  assert.match(text(tree), /1 resume saved/);
  assert.doesNotMatch(text(tree), /5 available slots|Analysis Complete/);
  assert.equal(nodes(tree).some(n => n.type === "input" && n.props.type === "file"), false);
  f.button(tree, "View PDF").props.onClick(); f.button(tree, "Download PDF").props.onClick();
  assert.deepEqual(f.calls, [["open", "view"], ["open", "download"]]);
});

test("Resumes omits the profile import card even when parsing is available", async () => {
  const f = await fixture({ state: { ...initial, confirmed: metadata }, capabilities: { upload: true, parsing: true } });
  const tree = f.render();
  assert.doesNotMatch(text(tree), /Import details into your profile|Review proposed profile information|Start review/);
  assert.ok(!nodes(tree).some(n => n.type === "ReviewFlow"));
});

test("Add resume opens the inline PDF picker; unavailable status never becomes an empty library", async () => {
  const f = await fixture(); f.button(f.render(), "Add resume").props.onClick();
  const picker = nodes(f.render()).find(n => n.type === "input" && n.props.type === "file");
  assert.equal(picker.props.accept, ".pdf,application/pdf");
  const failed = await fixture({ state: { ...initial, status: "unavailable" } });
  assert.equal(failed.button(failed.render(), "Add resume").props.disabled, true);
  assert.doesNotMatch(text(failed.render()), /No resumes yet/);
  assert.match(text(failed.render()), /could not be loaded/i);
});

test("pending actions keep confirmed metadata and disable duplicate mutations", async () => {
  const f = await fixture({ state: { ...initial, confirmed: metadata, busy: "upload" } }); const tree = f.render();
  assert.ok(text(tree).includes(metadata.fileName));
  assert.equal(f.button(tree, "Replace resume").props.disabled, true);
  assert.equal(f.button(tree, "Remove PDF").props.disabled, true);
});
