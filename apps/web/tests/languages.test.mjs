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
const links = await load("../src/lib/resume-link.ts");
const model = await load("../src/lib/languages.ts", { "./resume-link": links });
const { createLanguagesPreviewService } = await load("../src/lib/languages-preview-service.ts", { "./languages": model });
const valid = { ...model.emptyLanguage(), name: "Example language", referenceName: "Self-reported reference", referenceUrl: "https://example.invalid/reference" };
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && ([n.props.children].flat()[0] === label || String(n.props["aria-label"] ?? "").startsWith(label + " ")));
async function fixture(service) {
  const values = [], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "languages-fixture", useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { LanguagesSection } = await load("../src/components/profile/languages-section.tsx", {
    "@/lib/organization-logo": await load("../src/lib/organization-logo.ts", { "../../../api/src/opportunity_api/ingestion/sources/employers.json": { default: [] }, "./company-logo": { companyLogoUrl: (domain) => domain ? `/company-logos/${domain}.png` : null } }),
    "./credential-entry": await load("../src/components/profile/credential-entry.tsx", { "react/jsx-runtime": runtime, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" }, "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" } }),
    "@/components/ui/icon": { Icon: "Icon" },
    react, "react/jsx-runtime": runtime, "@/lib/languages": model, "@/lib/resume-link": links,
    "./collection-view": { CollectionView: "CollectionView" }, "@/components/ui/select": { Select: "Select" },
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const render = () => { cursor = 0; refCursor = 0; return LanguagesSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => { for (const key of ["name", "referenceName", "referenceUrl"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } }); };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}

test("required names, optional levels, native separation and reference URL validation", () => {
  assert.deepEqual(model.validateLanguage(valid), {});
  assert.deepEqual(model.emptyLanguage(), { name: "", cefr: "", native: false, referenceName: "", referenceUrl: "" });
  for (const name of ["", "   ", "x".repeat(256)]) assert.ok(model.validateLanguage({ ...valid, name }).name);
  for (const cefr of model.cefrLevels) assert.deepEqual(model.validateLanguage({ ...valid, cefr }), {});
  for (const cefr of ["native", "C3", "B2 ", null]) assert.ok(model.validateLanguage({ ...valid, cefr }).cefr);
  assert.ok(model.validateLanguage({ ...valid, native: true, cefr: "C2" }).cefr);
  assert.deepEqual(model.validateLanguage({ ...valid, native: true }), {});
  assert.ok(model.validateLanguage({ ...valid, referenceName: "x".repeat(256) }).referenceName);
  for (const referenceUrl of ["javascript:alert(1)", "data:text/plain,x", "/relative", "//example.invalid", "https://user:fake@example.invalid", "https://@example.invalid", "https://example.invalid/a b", "x".repeat(513)]) assert.ok(model.validateLanguage({ ...valid, referenceUrl }).referenceUrl);
  for (const referenceUrl of ["", "http://example.invalid/reference", valid.referenceUrl]) assert.deepEqual(model.validateLanguage({ ...valid, referenceUrl }), {});
});
test("name duplicates are trimmed/case-insensitive and exclude only the edited entry", async () => {
  const service = createLanguagesPreviewService(), first = await service.create({ ...valid, name: " English " });
  assert.equal(first.name, "English");
  assert.ok(model.validateLanguage({ ...valid, name: " english " }, [first]).name);
  assert.deepEqual(model.validateLanguage({ ...valid, name: " ENGLISH " }, [first], first.id), {});
  await assert.rejects(service.create({ ...valid, name: " ENGLISH " }), model.LanguageDuplicate);
  const second = await service.create({ ...valid, name: "French" });
  await assert.rejects(service.update(second.id, second.revision, { ...valid, name: "English" }), model.LanguageDuplicate);
  assert.equal((await service.load()).length, 2);
  const f = await fixture(service); button(f.render(), "Add language").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.onChange({ target: { value: " english " } });
  await f.submit(); assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.error);
  assert.equal(f.state().entries.length, 2);
});
test("native checkbox clears/disables CEFR and switching back remains unspecified", async () => {
  const f = await fixture(); button(f.render(), "Draft language").props.onClick();
  const level = () => find(f.render(), "Select");
  const native = () => nodes(f.render()).find(n => n.type === "input" && n.props.name === "native");
  assert.equal(level().props.value, ""); assert.equal(native().props.checked, false);
  level().props.onChange({ target: { value: "C2" } });
  native().props.onChange({ target: { checked: true } });
  assert.equal(level().props.value, ""); assert.equal(level().props.disabled, true); assert.equal(native().props.checked, true);
  native().props.onChange({ target: { checked: false } });
  assert.equal(level().props.value, ""); assert.equal(level().props.disabled, false);
  assert.equal(model.setLanguageNative(model.setLanguageNative({ ...valid, cefr: "B1" }, true), false).cefr, "");
});
test("service-reported duplicate retains draft without showing fake success", async () => {
  const service = createLanguagesPreviewService();
  const f = await fixture({ ...service, create: async () => { throw new model.LanguageDuplicate("Duplicate"); } });
  button(f.render(), "Add language").props.onClick(); f.fill(); await f.submit();
  assert.equal(f.state().entries.length, 0); assert.match(JSON.stringify(f.render()), /already listed/);
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.value, valid.name);
});
test("preview CRUD preserves stable IDs/order, proficiency and response isolation", async () => {
  const service = createLanguagesPreviewService();
  assert.deepEqual(await service.load(), []);
  const first = await service.create({ ...valid, cefr: "B2" });
  const second = await service.create({ ...valid, name: "Another language" });
  assert.equal(first.cefr, "B2");
  assert.equal(Object.hasOwn(model.languageDraft(first), "id"), false);
  const edited = await service.update(first.id, first.revision, { ...valid, name: "Changed" });
  assert.equal(edited.id, first.id); assert.equal(edited.position, first.position); assert.equal(edited.revision, 2);
  assert.deepEqual((await service.load()).map(r => r.id), [first.id, second.id]);
  edited.name = "Not persisted"; assert.equal((await service.load())[0].name, "Changed");
  await assert.rejects(service.update(first.id, 1, valid), model.LanguageConflict);
  await service.remove(first.id, 2); assert.deepEqual((await service.load()).map(r => r.id), [second.id]);
  assert.deepEqual(await createLanguagesPreviewService().load(), []);
});
test("failure/conflict simulations are one-shot and do not mutate records", async () => {
  const service = createLanguagesPreviewService(), row = await service.create(valid);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/); assert.deepEqual(await service.load(), [row]);
  }
  for (const operation of [() => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.conflictNext(); assert.deepEqual(await service.load(), [row]); await assert.rejects(operation(), model.LanguageConflict); assert.deepEqual(await service.load(), [row]);
  }
  await service.remove(row.id, row.revision);
});
test("real page validates drafts, never saves and Cancel/Escape discard edits", async () => {
  const f = await fixture();
  assert.equal(f.state().kind, "unconnected");
  button(f.render(), "Draft language").props.onClick(); await f.submit();
  assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.error);
  f.fill(); await f.submit();
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  assert.ok(button(f.render(), "Validate draft")); assert.equal(f.state().kind, "unconnected");
  assert.match(JSON.stringify(f.render()), /Draft fields are valid.*has not been saved/);
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Draft language").props.onClick();
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.value, "");
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.equal(find(f.render(), "form"), undefined);
});
test("component confirms CRUD, retains failed drafts/records and supports retry", async () => {
  const service = createLanguagesPreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add language").props.onClick(); f.fill();
  service.failNext(); await f.submit(); assert.equal(f.state().entries.length, 0); assert.ok(find(f.render(), "form"));
  await f.submit(); let row = f.state().entries[0];
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.onChange({ target: { value: "Correction" } });
  service.failNext(); await f.submit(); assert.equal(f.state().entries[0].name, valid.name);
  button(f.render(), "Cancel").props.onClick(); assert.equal((await service.load())[0].name, valid.name);
  button(f.row(row), "Edit").props.onClick(); nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.onChange({ target: { value: "Confirmed" } });
  await f.submit(); row = f.state().entries[0]; assert.equal(row.name, "Confirmed");
  button(f.row(row), "Delete").props.onClick(); button(f.render(), "Keep entry").props.onClick(); assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick(); service.failNext(); button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 1);
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("load retry and revision conflicts retain drafts and deletion targets until cancelled", async () => {
  const service = createLanguagesPreviewService(); service.failNext(); const f = await fixture(service);
  assert.equal(f.state().kind, "error"); await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r)); assert.equal(f.state().kind, "ready");
  button(f.render(), "Add language").props.onClick(); f.fill(); await f.submit(); const row = f.state().entries[0];
  button(f.row(row), "Edit").props.onClick(); service.conflictNext(); await f.submit();
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.ok(find(f.render(), "form"));
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Reload languages").props.onClick(); await new Promise(r => setImmediate(r));
  button(f.row(row), "Delete").props.onClick(); service.conflictNext(); button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.equal(f.state().entries.length, 1);
  nodes(f.render()).find(n => n.props?.["aria-label"] === "Confirm language deletion").props.onKeyDown({ key: "Escape" });
  assert.equal(button(f.render(), "Confirm delete"), undefined);
});
test("create/update/delete pending guards reject duplicate submissions and prevent cancellation", async () => {
  const service = createLanguagesPreviewService(); let release, calls = 0;
  let wait = new Promise(resolve => { release = resolve; });
  const slow = method => async (...args) => { calls++; await wait; return service[method](...args); };
  const f = await fixture({ ...service, create: slow("create"), update: slow("update"), remove: slow("remove") });
  button(f.render(), "Add language").props.onClick(); f.fill();
  let first = f.submit(); await f.submit(); assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.ok(find(f.render(), "form"));
  release(); await first;
  let row = f.state().entries[0]; button(f.row(row), "Edit").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  first = f.submit(); await f.submit(); assert.equal(calls, 2); release(); await first;
  row = f.state().entries[0]; button(f.row(row), "Delete").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  button(f.render(), "Confirm delete").props.onClick(); button(f.render(), "Deleting...").props.onClick(); assert.equal(calls, 3); assert.equal(button(f.render(), "Keep entry").props.disabled, true);
  release(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("rendering distinguishes native, CEFR and unspecified without claiming verification", async () => {
  const f = await fixture(); const row = { ...valid, id: "fixture", revision: 1, position: 1 };
  assert.match(JSON.stringify(f.render()), /Proficiency is self-reported/);
  const rendered = f.row(row), anchors = nodes(rendered).filter(n => n.type === "a");
  assert.equal(anchors.length, 1); assert.equal(anchors[0].props.rel, "noopener noreferrer"); assert.equal(anchors[0].props.target, "_blank");
  assert.match(JSON.stringify(rendered), /Proficiency not specified/);
  assert.match(JSON.stringify(f.row({ ...row, cefr: "C2" })), /C2 · Proficient/);
  const native = JSON.stringify(f.row({ ...row, native: true })); assert.match(native, /Native or bilingual/); assert.doesNotMatch(native, /C2/);
  assert.equal(nodes(f.row({ ...row, referenceUrl: "javascript:alert(1)" })).filter(n => n.type === "a").length, 0);
  const minimal = JSON.stringify(f.row({ ...row, referenceName: "", referenceUrl: "" }));
  assert.doesNotMatch(minimal, /Show credential|Certificate:/);
});
test("preview rejects production/test and renders only in development", async () => {
  const { default: Page } = await load("../src/app/dev/languages/page.tsx", { "next/navigation": { notFound() { throw new Error("404"); } }, "@/components/dev/languages-preview": { LanguagesPreview: "Preview" }, "react/jsx-runtime": runtime });
  const previous = process.env.NODE_ENV;
  try { for (const mode of ["production", "test"]) { process.env.NODE_ENV = mode; assert.throws(() => Page(), /404/); } process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview"); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test("native and unspecified proficiency persist separately through confirmed edits", async () => {
  const service = createLanguagesPreviewService(), f = await fixture(service);
  button(f.render(), "Add language").props.onClick(); f.fill();
  find(f.render(), "Select").props.onChange({ target: { value: "C2" } });
  nodes(f.render()).find(n => n.type === "input" && n.props.name === "native").props.onChange({ target: { checked: true } });
  await f.submit(); let row = f.state().entries[0]; assert.equal(row.native, true); assert.equal(row.cefr, "");
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "input" && n.props.name === "native").props.onChange({ target: { checked: false } });
  assert.equal(find(f.render(), "Select").props.value, ""); await f.submit(); row = f.state().entries[0];
  assert.equal(row.native, false); assert.equal(row.cefr, "");
  assert.match(JSON.stringify(f.row(row)), /Proficiency not specified/);
  await assert.rejects(service.update(row.id, row.revision, { ...model.languageDraft(row), native: true, cefr: "C2" }), /Validation/);
  assert.equal((await service.load())[0].native, false);
});
