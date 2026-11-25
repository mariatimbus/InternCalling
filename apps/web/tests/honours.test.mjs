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
const dates = await load("../src/lib/experience.ts");
const links = await load("../src/lib/resume-link.ts");
const model = await load("../src/lib/honours.ts", { "./experience": dates, "./resume-link": links });
const { createHonoursPreviewService } = await load("../src/lib/honours-preview-service.ts", { "./honours": model });
const valid = { ...model.emptyHonour(), title: "Synthetic award", organization: "Synthetic issuer", receivedDate: "2024-02", description: "First line\nSecond line", referenceUrl: "https://example.invalid/award" };
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && ([n.props.children].flat()[0] === label || String(n.props["aria-label"] ?? "").startsWith(label + " ")));
async function fixture(service) {
  const values = [], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "honours-fixture", useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { HonoursSection } = await load("../src/components/profile/honours-section.tsx", {
    "@/lib/organization-logo": await load("../src/lib/organization-logo.ts", { "../../../api/src/opportunity_api/ingestion/sources/employers.json": { default: [] }, "./company-logo": { companyLogoUrl: (domain) => domain ? `/company-logos/${domain}.png` : null } }),
    "./credential-entry": await load("../src/components/profile/credential-entry.tsx", { "react/jsx-runtime": runtime, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" }, "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" } }),
    "@/components/ui/icon": { Icon: "Icon" },
    react, "react/jsx-runtime": runtime, "@/lib/honours": model, "@/lib/resume-link": links,
    "./collection-view": { CollectionView: "CollectionView" }, "@/components/ui/field": { Field: "Field", fieldControl: "" },
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const render = () => { cursor = 0; refCursor = 0; return HonoursSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => { for (const key of ["title", "organization", "receivedDate", "referenceUrl"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } }); };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}

test("title required; optional fields and year/month dates retain honest precision", () => {
  assert.deepEqual(model.validateHonour(valid), {});
  assert.deepEqual(model.validateHonour({ ...model.emptyHonour(), title: "Award" }), {});
  for (const title of ["", "   ", "x".repeat(256)]) assert.ok(model.validateHonour({ ...valid, title }).title);
  for (const receivedDate of ["2024-13", "2024-00", "2024-02-01", "1899", "2101", "unknown"]) assert.ok(model.validateHonour({ ...valid, receivedDate }).receivedDate);
  for (const receivedDate of ["", "   ", "2024", "2024-02"]) assert.deepEqual(model.validateHonour({ ...valid, receivedDate }), {});
  assert.ok(model.validateHonour({ ...valid, organization: "x".repeat(256) }).organization);
  assert.ok(model.validateHonour({ ...valid, description: "x".repeat(5001) }).description);
});
test("reference URL accepts only safe absolute HTTP/HTTPS without credentials", () => {
  for (const referenceUrl of ["javascript:alert(1)", "data:text/plain,x", "/relative", "//example.invalid", "https://user:fake@example.invalid", "https://@example.invalid", "https://example.invalid/a b", "https://example.invalid/\\bad", "x".repeat(513)]) assert.ok(model.validateHonour({ ...valid, referenceUrl }).referenceUrl);
  for (const referenceUrl of ["", "http://example.invalid/reference", valid.referenceUrl]) assert.deepEqual(model.validateHonour({ ...valid, referenceUrl }), {});
});
test("preview CRUD preserves stable IDs/order, date precision and response isolation", async () => {
  const service = createHonoursPreviewService();
  assert.deepEqual(await service.load(), []);
  const first = await service.create({ ...valid, receivedDate: "2024" });
  const second = await service.create({ ...valid, title: "Another" });
  assert.equal(first.receivedDate, "2024");
  assert.equal(Object.hasOwn(model.honourDraft(first), "id"), false);
  const edited = await service.update(first.id, first.revision, { ...valid, title: "Changed" });
  assert.equal(edited.id, first.id); assert.equal(edited.position, first.position); assert.equal(edited.revision, 2);
  assert.deepEqual((await service.load()).map(r => r.id), [first.id, second.id]);
  edited.title = "Not persisted"; assert.equal((await service.load())[0].title, "Changed");
  await assert.rejects(service.update(first.id, 1, valid), model.HonourConflict);
  await service.remove(first.id, 2); assert.deepEqual((await service.load()).map(r => r.id), [second.id]);
  assert.deepEqual(await createHonoursPreviewService().load(), []);
});
test("failure/conflict simulations are one-shot and do not mutate records", async () => {
  const service = createHonoursPreviewService(), row = await service.create(valid);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/); assert.deepEqual(await service.load(), [row]);
  }
  for (const operation of [() => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.conflictNext(); assert.deepEqual(await service.load(), [row]); await assert.rejects(operation(), model.HonourConflict); assert.deepEqual(await service.load(), [row]);
  }
  await service.remove(row.id, row.revision);
});
test("real page validates drafts, never saves and Cancel/Escape discard edits", async () => {
  const f = await fixture();
  assert.equal(f.state().kind, "unconnected");
  button(f.render(), "Draft award").props.onClick(); await f.submit();
  assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.error);
  f.fill(); await f.submit();
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  assert.ok(button(f.render(), "Validate draft")); assert.equal(f.state().kind, "unconnected");
  assert.match(JSON.stringify(f.render()), /Draft is valid.*has not been saved/);
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Draft award").props.onClick();
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.value, "");
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.equal(find(f.render(), "form"), undefined);
});
test("component confirms CRUD, retains failed drafts/records and supports retry", async () => {
  const service = createHonoursPreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add award").props.onClick(); f.fill();
  service.failNext(); await f.submit(); assert.equal(f.state().entries.length, 0); assert.ok(find(f.render(), "form"));
  await f.submit(); let row = f.state().entries[0];
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.onChange({ target: { value: "Correction" } });
  service.failNext(); await f.submit(); assert.equal(f.state().entries[0].title, valid.title);
  button(f.render(), "Cancel").props.onClick(); assert.equal((await service.load())[0].title, valid.title);
  button(f.row(row), "Edit").props.onClick(); nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.onChange({ target: { value: "Confirmed" } });
  await f.submit(); row = f.state().entries[0]; assert.equal(row.title, "Confirmed");
  button(f.row(row), "Delete").props.onClick(); button(f.render(), "Keep entry").props.onClick(); assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick(); service.failNext(); button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 1);
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("load retry and revision conflicts retain drafts and deletion targets until cancelled", async () => {
  const service = createHonoursPreviewService(); service.failNext(); const f = await fixture(service);
  assert.equal(f.state().kind, "error"); await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r)); assert.equal(f.state().kind, "ready");
  button(f.render(), "Add award").props.onClick(); f.fill(); await f.submit(); const row = f.state().entries[0];
  button(f.row(row), "Edit").props.onClick(); service.conflictNext(); await f.submit();
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.ok(find(f.render(), "form"));
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Reload honours").props.onClick(); await new Promise(r => setImmediate(r));
  button(f.row(row), "Delete").props.onClick(); service.conflictNext(); button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.equal(f.state().entries.length, 1);
  nodes(f.render()).find(n => n.props?.["aria-label"] === "Confirm award deletion").props.onKeyDown({ key: "Escape" });
  assert.equal(button(f.render(), "Confirm delete"), undefined);
});
test("create/update/delete pending guards reject duplicate submissions and prevent cancellation", async () => {
  const service = createHonoursPreviewService(); let release, calls = 0;
  let wait = new Promise(resolve => { release = resolve; });
  const slow = method => async (...args) => { calls++; await wait; return service[method](...args); };
  const f = await fixture({ ...service, create: slow("create"), update: slow("update"), remove: slow("remove") });
  button(f.render(), "Add award").props.onClick(); f.fill();
  let first = f.submit(); await f.submit(); assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.ok(find(f.render(), "form"));
  release(); await first;
  let row = f.state().entries[0]; button(f.row(row), "Edit").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  first = f.submit(); await f.submit(); assert.equal(calls, 2); release(); await first;
  row = f.state().entries[0]; button(f.row(row), "Delete").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  button(f.render(), "Confirm delete").props.onClick(); button(f.render(), "Deleting...").props.onClick(); assert.equal(calls, 3); assert.equal(button(f.render(), "Keep entry").props.disabled, true);
  release(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("rendering omits missing optional details, preserves text and hides unsafe links", async () => {
  const f = await fixture(); const row = { ...valid, id: "fixture", revision: 1, position: 1 };
  const rendered = f.row(row), anchors = nodes(rendered).filter(n => n.type === "a");
  assert.equal(anchors.length, 1); assert.equal(anchors[0].props.rel, "noopener noreferrer"); assert.equal(anchors[0].props.target, "_blank");
  assert.match(JSON.stringify(rendered), /First line/);
  assert.equal(nodes(f.row({ ...row, referenceUrl: "javascript:alert(1)" })).filter(n => n.type === "a").length, 0);
  const minimal = f.row({ ...model.emptyHonour(), title: "Award", id: "minimal", revision: 1, position: 2 });
  assert.equal(nodes(minimal).filter(n => n.type === "p" || n.type === "a").length, 0);
});
test("preview rejects production/test and renders only in development", async () => {
  const { default: Page } = await load("../src/app/dev/honours/page.tsx", { "next/navigation": { notFound() { throw new Error("404"); } }, "@/components/dev/honours-preview": { HonoursPreview: "Preview" }, "react/jsx-runtime": runtime });
  const previous = process.env.NODE_ENV;
  try { for (const mode of ["production", "test"]) { process.env.NODE_ENV = mode; assert.throws(() => Page(), /404/); } process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview"); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
