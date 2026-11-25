import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(file, deps = {}) {
  deps = { "@/components/ui/icon": { Icon: "Icon" }, ...deps };
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", outputText)(name => { assert.ok(name in deps, name); return deps[name]; }, exports);
  return exports;
}
const dates = await load("../src/lib/experience.ts");
const links = await load("../src/lib/resume-link.ts");
const model = await load("../src/lib/projects.ts", { "./experience": dates, "./resume-link": links });
const { createProjectsPreviewService } = await load("../src/lib/projects-preview-service.ts", { "./projects": model });
const valid = { ...model.emptyProject(), name: "Synthetic project", startDate: "2024", endDate: "2025-02", technologies: ["python"] };
test("project validation requires name, validates partial dates, URLs and distinct technologies", () => {
  assert.deepEqual(model.validateProject(valid), {});
  assert.deepEqual(model.validateProject({ ...model.emptyProject(), name: "Undated project" }), {});
  assert.ok(model.validateProject(model.emptyProject()).name);
  for (const date of ["2024-13", "2024-01-01", "unknown"]) assert.ok(model.validateProject({ ...valid, startDate: date }).startDate);
  assert.ok(model.validateProject({ ...valid, endDate: "2023" }).endDate);
  assert.deepEqual(model.validateProject({ ...valid, ongoing: true, endDate: "" }), {});
  for (const url of ["javascript:alert(1)", "/relative", "https://user:fake@example.invalid", "x".repeat(513)]) assert.ok(model.validateProject({ ...valid, repositoryUrl: url }).repositoryUrl);
  assert.deepEqual(model.validateProject({ ...valid, repositoryUrl: "https://example.invalid/repository", demoUrl: "http://example.invalid/demo" }), {});
  assert.ok(model.validateProject({ ...valid, technologies: ["Python", " python "] }).technologies);
});
test("preview CRUD preserves IDs/order, checks conflicts and retains records after failures", async () => {
  const service = createProjectsPreviewService();
  const first = await service.create(valid);
  assert.equal(Object.hasOwn(model.projectDraft(first), "id"), false);
  const changed = await service.update(first.id, first.revision, { ...valid, name: "Changed" });
  assert.equal(changed.id, first.id); assert.equal(changed.position, first.position);
  await assert.rejects(service.update(first.id, first.revision, valid), model.ProjectConflict);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(changed.id, changed.revision, valid), () => service.remove(changed.id, changed.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/); assert.equal((await service.load()).length, 1);
  }
  changed.technologies.push("not persisted");
  assert.deepEqual((await service.load())[0].technologies, ["python"]);
  await service.remove(first.id, 2); assert.deepEqual(await service.load(), []);
});
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" ? tree : ""; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && (n.props["aria-label"] ?? text(n)).startsWith(label));
async function fixture(service) {
  const values = [], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "projects-fixture", useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { ProjectsSection } = await load("../src/components/profile/projects-section.tsx", {
    react, "react/jsx-runtime": runtime, "@/lib/projects": model, "@/lib/resume-link": links,
    "./collection-view": { CollectionView: "CollectionView" }, "./skill-chip": { SkillChip: "SkillChip" }, "./grouped-skill-picker": { GroupedSkillPicker: "Picker" },
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" }, "@/components/ui/field": { Field: "Field", fieldControl: "" },
  });
  const render = () => { cursor = 0; refCursor = 0; return ProjectsSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => { for (const key of ["name", "startDate", "endDate"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } }); };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}
test("real drafting cannot persist; Cancel and Escape discard drafts, project technologies remain local", async () => {
  const f = await fixture();
  button(f.render(), "Draft project").props.onClick(); f.fill();
  await find(f.render(), "Picker").props.onAdd("python");
  assert.deepEqual(find(f.render(), "Picker").props.selected, [{ name: "python" }]);
  assert.equal(find(f.render(), "Picker").props.onRetry, undefined);
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  await f.submit(); assert.equal(f.state().kind, "unconnected");
  button(f.render(), "Cancel").props.onClick();
  button(f.render(), "Draft project").props.onClick();
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.value, "");
  assert.deepEqual(find(f.render(), "Picker").props.selected, []);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.equal(find(f.render(), "form"), undefined);
});
test("component validates, creates, edits and confirms deletes; failures retain draft and entry", async () => {
  const service = createProjectsPreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add project").props.onClick(); await f.submit();
  assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.error);
  f.fill(); await find(f.render(), "Picker").props.onAdd("python"); service.failNext(); await f.submit();
  assert.equal(f.state().entries.length, 0); assert.ok(find(f.render(), "form"));
  await f.submit(); let row = f.state().entries[0]; assert.deepEqual(row.technologies, ["python"]);
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.onChange({ target: { value: "Edited" } });
  await f.submit(); row = f.state().entries[0]; assert.equal(row.name, "Edited");
  button(f.row(row), "Delete").props.onClick(); button(f.render(), "Keep entry").props.onClick(); assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick(); service.failNext();
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 1);
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("pending writes are not duplicated and optional saved links are safe", async () => {
  const service = createProjectsPreviewService(); let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ ...service, create: async draft => { calls++; await wait; return service.create(draft); } });
  button(f.render(), "Add project").props.onClick(); f.fill();
  const first = f.submit(); await f.submit(); assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  release(); await first;
  const row = { ...f.state().entries[0], repositoryUrl: "https://example.invalid/repo", demoUrl: "javascript:alert(1)" };
  const anchors = nodes(f.row(row)).filter(n => n.type === "a");
  assert.equal(anchors.length, 1); assert.equal(anchors[0].props.rel, "noopener noreferrer"); assert.equal(anchors[0].props.target, "_blank");
});
test("load errors retry, conflicts retain drafts and production preview returns 404", async () => {
  const service = createProjectsPreviewService(); service.failNext(); const f = await fixture(service);
  assert.equal(f.state().kind, "error"); await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r)); assert.equal(f.state().kind, "ready");
  const conflicting = await fixture({ ...service, create: async () => { throw new model.ProjectConflict("Conflict"); } });
  button(conflicting.render(), "Add project").props.onClick(); conflicting.fill(); await conflicting.submit(); assert.match(JSON.stringify(conflicting.render()), /changed elsewhere/);
  const { default: Page } = await load("../src/app/dev/projects/page.tsx", { "next/navigation": { notFound() { throw new Error("404"); } }, "@/components/dev/projects-preview": { ProjectsPreview: "Preview" }, "react/jsx-runtime": runtime });
  const previous = process.env.NODE_ENV;
  try { process.env.NODE_ENV = "production"; assert.throws(() => Page(), /404/); process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview"); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test("project periods preserve date precision and unknown endpoints", () => {
  assert.equal(model.projectPeriod({ startDate: "2026-10", endDate: "", ongoing: true }), "Oct 2026 – Present");
  assert.equal(model.projectPeriod({ startDate: "2025", endDate: "2026", ongoing: false }), "2025 – 2026");
  assert.equal(model.projectPeriod({ startDate: "2026-10", endDate: "", ongoing: false }), "Started Oct 2026");
  assert.equal(model.projectPeriod({ startDate: "", endDate: "2026-02", ongoing: false }), "Ended Feb 2026");
  assert.equal(model.projectPeriod({ startDate: "", endDate: "", ongoing: true }), "Ongoing");
  assert.equal(model.projectPeriod({ startDate: "", endDate: "", ongoing: false }), "Dates not provided");
});

test("GitHub field persists through create, reload and edit and renders a safe Code link", async () => {
  const service = createProjectsPreviewService(), f = await fixture(service);
  button(f.render(), "Add project").props.onClick(); f.fill();
  const github = nodes(f.render()).find(n => n.type === "Input" && n.props.name === "repositoryUrl");
  assert.match(github.props.label, /GitHub/);
  assert.equal(github.props.type, "url");
  const url = "https://github.com/example-student/portfolio";
  github.props.onChange({ target: { value: url } }); await f.submit();
  const reloaded = await fixture(service), row = reloaded.state().entries[0];
  assert.equal(row.repositoryUrl, url);
  const anchor = nodes(reloaded.row(row)).find(n => n.type === "a" && n.props.href === url);
  assert.ok(anchor); assert.equal(anchor.props.rel, "noopener noreferrer");
  assert.ok(text(reloaded.row(row)).includes("Code:"));
  button(reloaded.row(row), "Edit").props.onClick();
  assert.equal(nodes(reloaded.render()).find(n => n.type === "Input" && n.props.name === "repositoryUrl").props.value, url);
});

test("project cards have a pencil edit control and reveal long descriptions without changing saved text", async () => {
  const service = createProjectsPreviewService(), f = await fixture(service);
  const description = "Build accessible tools for students.\n".repeat(12) + "The final source sentence.";
  const row = { ...valid, id: "synthetic-project", revision: 1, position: 0, description, ongoing: true, endDate: "" };
  let card = f.row(row);
  assert.equal(find(card, "h3").props.children, row.name);
  assert.ok(find(button(card, "Edit"), "svg"));
  assert.ok(!text(card).includes("The final source sentence."));
  const more = button(card, "Show more"); assert.equal(more.props["aria-expanded"], false); more.props.onClick();
  card = f.row(row); assert.ok(text(card).includes(description));
  button(card, "Show less").props.onClick(); assert.ok(!text(f.row(row)).includes("The final source sentence."));
  assert.ok(description.endsWith("The final source sentence."));
});
