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
const model = await load("../src/lib/experience.ts");
const { createExperiencePreviewService } = await load("../src/lib/experience-preview-service.ts", { "./experience": model });
const valid = { ...model.emptyExperience(), role: "Engineer", organization: "Synthetic organization", startDate: "2024", endDate: "2025-03", achievements: "Delivered a project\nImproved tests" };
test("partial dates validate without inventing a month/day; required, current and bullet rules are enforced", () => {
  assert.deepEqual(model.partialDate("2024"), { year: 2024 });
  assert.deepEqual(model.partialDate("2024-03"), { year: 2024, month: 3 });
  for (const date of ["2024-13", "2024-00", "2024-3", "2024-03-01", "nonsense", "1899"]) assert.equal(model.partialDate(date), null);
  assert.deepEqual(model.validateExperience(valid), {});
  assert.ok(model.validateExperience(model.emptyExperience()).role);
  assert.ok(model.validateExperience({ ...valid, endDate: "2023" }).endDate);
  assert.ok(model.validateExperience({ ...valid, startDate: "2024-06", endDate: "2024-05" }).endDate);
  assert.deepEqual(model.validateExperience({ ...valid, startDate: "2024-06", endDate: "2024" }), {});
  assert.deepEqual(model.validateExperience({ ...valid, current: true, endDate: "" }), {});
  assert.ok(model.validateExperience({ ...valid, current: true }).endDate);
  assert.ok(model.validateExperience({ ...valid, achievements: Array(21).fill("bullet").join("\n") }).achievements);
});
test("preview adapter preserves IDs/order, versions edits, clones responses and rejects conflicts/failures without data loss", async () => {
  const service = createExperiencePreviewService();
  assert.deepEqual(await service.load(), []);
  const first = await service.create(valid);
  assert.deepEqual(first.achievements, ["Delivered a project", "Improved tests"]);
  assert.equal(Object.hasOwn(model.experienceDraft(first), "id"), false);
  const second = await service.create({ ...valid, role: "Researcher" });
  const edited = await service.update(first.id, first.revision, { ...valid, role: "Senior engineer" });
  assert.equal(edited.id, first.id); assert.equal(edited.position, first.position);
  await assert.rejects(service.update(first.id, first.revision, valid), /Conflict/);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(edited.id, edited.revision, valid), () => service.remove(edited.id, edited.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/);
    assert.equal((await service.load()).length, 2);
  }
  edited.role = "Local mutation";
  assert.equal((await service.load())[0].role, "Senior engineer");
  await service.remove(first.id, 2);
  assert.deepEqual((await service.load()).map(r => r.id), [second.id]);
  assert.deepEqual(await createExperiencePreviewService().load(), []);
});
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && [n.props.children].flat().includes(label));
async function fixture(service) {
  const values = [], refs = [], effects = [];
  let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "experience-fixture",
    useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { ExperienceSection } = await load("../src/components/profile/experience-section.tsx", {
    react, "react/jsx-runtime": runtime, "@/lib/experience": model,
    "./collection-view": { CollectionView: "CollectionView" }, "@/components/ui/input": { Input: "Input" },
    "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" }, "@/components/ui/field": { Field: "Field", fieldControl: "" }, "@/components/ui/select": { Select: "Select" },
  });
  const render = () => { cursor = 0; refCursor = 0; return ExperienceSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => {
    for (const key of ["role", "organization", "startDate", "endDate"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } });
  };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}
test("real unconnected mode allows drafts, validates, cancels with Escape and never claims saved data", async () => {
  const f = await fixture();
  assert.equal(f.state().kind, "unconnected");
  button(f.render(), "Draft experience").props.onClick();
  await f.submit();
  assert.ok(nodes(f.render()).some(n => n.type === "Input" && n.props.name === "role" && n.props.error));
  f.fill();
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  await f.submit();
  assert.equal(f.state().kind, "unconnected");
  assert.match(JSON.stringify(f.render()), /has not been saved/);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" });
  assert.equal(find(f.render(), "form"), undefined);
  assert.doesNotMatch(JSON.stringify(f.render()), /Experience saved/);
});
test("connected component loads, Cancel discards drafts, preview CRUD confirms results and failures retain data/drafts", async () => {
  const service = createExperiencePreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add experience").props.onClick(); f.fill();
  button(f.render(), "Cancel").props.onClick(); assert.equal((await service.load()).length, 0);
  button(f.render(), "Add experience").props.onClick(); f.fill();
  service.failNext(); await f.submit();
  assert.equal(f.state().entries.length, 0);
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "role").props.value, valid.role);
  await f.submit();
  let row = f.state().entries[0]; assert.equal(row.role, valid.role);
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "role").props.onChange({ target: { value: "Updated role" } });
  await f.submit();
  row = f.state().entries[0]; assert.equal(row.role, "Updated role");
  button(f.row(row), "Delete").props.onClick();
  assert.equal((await service.load()).length, 1);
  button(f.render(), "Keep entry").props.onClick(); assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick(); service.failNext();
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.equal(f.state().entries.length, 1);
  assert.match(JSON.stringify(f.render()), /could not be deleted/);
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.equal(f.state().entries.length, 0);
});
test("load errors are retryable; typed rendering distinguishes unknown, loading, empty and error", async () => {
  const service = createExperiencePreviewService(); service.failNext();
  const f = await fixture(service);
  assert.equal(f.state().kind, "error");
  await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r));
  assert.equal(f.state().kind, "ready");
  const { CollectionView } = await load("../src/components/profile/collection-view.tsx", { "react/jsx-runtime": runtime, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" } });
  assert.match(JSON.stringify(CollectionView({ state: { kind: "unconnected" } })), /not connected/);
  assert.match(JSON.stringify(CollectionView({ state: { kind: "ready", entries: [] } })), /No experience/);
  assert.equal(CollectionView({ state: { kind: "loading" } }).props.role, "status");
  assert.equal(CollectionView({ state: { kind: "error", message: "Retry" } }).props.role, "alert");
});
test("preview route is development-only and responsive forms expose native keyboard controls and labels", async () => {
  const { default: Page } = await load("../src/app/dev/experience/page.tsx", {
    "next/navigation": { notFound() { throw new Error("404"); } },
    "@/components/dev/experience-preview": { ExperiencePreview: "Preview" }, "react/jsx-runtime": runtime,
  });
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production"; assert.throws(() => Page(), /404/);
    process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview");
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  const f = await fixture();
  button(f.render(), "Draft experience").props.onClick();
  assert.ok(nodes(f.render()).some(n => n.type === "div" && n.props.className?.includes("sm:grid-cols-2")));
  assert.ok(nodes(f.render()).some(n => n.type === "Input" && n.props.label.includes("(required)") && n.props.required));
  assert.ok(nodes(f.render()).some(n => n.type === "input" && n.props.type === "checkbox"));
  assert.ok(button(f.render(), "Cancel"));
});

test("pending submissions cannot duplicate writes or discard the draft", async () => {
  const base = createExperiencePreviewService(); let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture({ ...base, create: async draft => { calls++; await gate; return base.create(draft); } });
  button(f.render(), "Add experience").props.onClick(); f.fill();
  const first = f.submit(); await f.submit();
  assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" });
  assert.ok(find(f.render(), "form"));
  assert.equal(f.state().entries.length, 0);
  release(); await first;
  assert.equal(f.state().entries.length, 1);
});

test("Experience separators are readable literals and user question marks remain unchanged", async () => {
  const service = createExperiencePreviewService();
  const entry = await service.create({ ...valid, organization: "Microsoft?", location: "Bucharest", startDate: "2025", current: true, endDate: "" });
  const f = await fixture(service);
  const row = f.row(entry);
  const text = node => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : "";
  assert.match(text(row), /Microsoft\? \/ Bucharest/);
  assert.match(text(row), /2025 to Present/);
  button(f.row(entry), "Edit").props.onClick();
  assert.doesNotMatch(text(f.render()), /Draft only \?/);
});
