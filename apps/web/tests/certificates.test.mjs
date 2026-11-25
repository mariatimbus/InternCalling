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
const model = await load("../src/lib/certificates.ts", { "./experience": dates, "./resume-link": links });
const { createCertificatesPreviewService } = await load("../src/lib/certificates-preview-service.ts", { "./certificates": model });
const valid = { ...model.emptyCertificate(), name: "Synthetic certificate", issueDate: "2024", expirationDate: "2025-02", organization: "Synthetic issuer" };
test("certificate required fields, optional dates, precision, ranges and credential URL safety", () => {
  assert.deepEqual(model.validateCertificate(valid), {});
  assert.deepEqual(model.validateCertificate({ ...model.emptyCertificate(), name: "Undated", organization: "Issuer" }), {});
  assert.ok(model.validateCertificate(model.emptyCertificate()).name);
  assert.ok(model.validateCertificate(model.emptyCertificate()).organization);
  for (const key of ["name", "organization"]) for (const value of ["   ", "x".repeat(256)]) assert.ok(model.validateCertificate({ ...valid, [key]: value })[key]);
  for (const key of ["issueDate", "expirationDate"]) for (const value of ["2024-13", "2024-00", "2024-01-01", "1899", "2101", "unknown"]) assert.ok(model.validateCertificate({ ...valid, [key]: value })[key]);
  assert.ok(model.validateCertificate({ ...valid, expirationDate: "2023" }).expirationDate);
  assert.ok(model.validateCertificate({ ...valid, issueDate: "2024-09", expirationDate: "2024-08" }).expirationDate);
  for (const [issueDate, expirationDate] of [["2024", "2024-02"], ["2024-09", "2024"], ["", "2024"], ["2024", ""]]) assert.deepEqual(model.validateCertificate({ ...valid, issueDate, expirationDate }), {});
  assert.deepEqual(model.validateCertificate({ ...valid, doesNotExpire: true, expirationDate: "" }), {});
  assert.ok(model.validateCertificate({ ...valid, doesNotExpire: true }).expirationDate);
  assert.equal(model.emptyCertificate().doesNotExpire, false);
  for (const url of ["javascript:alert(1)", "data:text/plain,test", "//example.invalid", "/relative", "https://user:fake@example.invalid", "https://@example.invalid", "https://example.invalid/space here", "x".repeat(513)]) assert.ok(model.validateCertificate({ ...valid, credentialUrl: url }).credentialUrl);
  for (const url of ["", "https://example.invalid/credential", "http://example.invalid/credential"]) assert.deepEqual(model.validateCertificate({ ...valid, credentialUrl: url }), {});
  assert.ok(model.validateCertificate({ ...valid, credentialId: "x".repeat(256) }).credentialId);
});

test("preview CRUD preserves IDs/order, checks conflicts and retains records after failures", async () => {
  const service = createCertificatesPreviewService();
  const first = await service.create(valid);
  assert.equal(Object.hasOwn(model.certificateDraft(first), "id"), false);
  const changed = await service.update(first.id, first.revision, { ...valid, name: "Changed" });
  assert.equal(changed.id, first.id); assert.equal(changed.position, first.position);
  await assert.rejects(service.update(first.id, first.revision, valid), model.CertificateConflict);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(changed.id, changed.revision, valid), () => service.remove(changed.id, changed.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/); assert.equal((await service.load()).length, 1);
  }
  changed.name = "not persisted";
  assert.equal((await service.load())[0].name, "Changed");
  await service.remove(first.id, 2); assert.deepEqual(await service.load(), []);
});
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && ([n.props.children].flat()[0] === label || String(n.props["aria-label"] ?? "").startsWith(label + " ")));
async function fixture(service) {
  const values = [], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "certificates-fixture", useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { CertificatesSection } = await load("../src/components/profile/certificates-section.tsx", {
    "@/lib/organization-logo": await load("../src/lib/organization-logo.ts", { "../../../api/src/opportunity_api/ingestion/sources/employers.json": { default: [] }, "./company-logo": { companyLogoUrl: (domain) => domain ? `/company-logos/${domain}.png` : null } }),
    "./credential-entry": await load("../src/components/profile/credential-entry.tsx", { "react/jsx-runtime": runtime, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" }, "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" } }),
    "@/components/ui/icon": { Icon: "Icon" },
    react, "react/jsx-runtime": runtime, "@/lib/certificates": model, "@/lib/resume-link": links,
    "./collection-view": { CollectionView: "CollectionView" },
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const render = () => { cursor = 0; refCursor = 0; return CertificatesSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => { for (const key of ["name", "organization", "issueDate", "expirationDate"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } }); };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}
test("real drafting never persists; Cancel and Escape clear draft and non-expiring is explicit", async () => {
  const f = await fixture();
  button(f.render(), "Draft certificate").props.onClick(); f.fill();
  const checkbox = () => nodes(f.render()).find(n => n.type === "input" && n.props.name === "doesNotExpire");
  assert.equal(checkbox().props.checked, false);
  checkbox().props.onChange({ target: { checked: true } });
  const expiration = () => nodes(f.render()).find(n => n.type === "Input" && n.props.name === "expirationDate");
  assert.equal(expiration().props.value, ""); assert.equal(expiration().props.disabled, true);
  checkbox().props.onChange({ target: { checked: false } });
  assert.equal(expiration().props.value, ""); assert.equal(expiration().props.disabled, false);
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  await f.submit(); assert.equal(f.state().kind, "unconnected"); assert.match(JSON.stringify(f.render()), /has not been saved/);
  button(f.render(), "Cancel").props.onClick();
  button(f.render(), "Draft certificate").props.onClick();
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.value, "");
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.equal(find(f.render(), "form"), undefined);
});

test("component validates, creates, edits and confirms deletes; failures retain draft and entry", async () => {
  const service = createCertificatesPreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add certificate").props.onClick(); await f.submit();
  assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.error);
  f.fill(); service.failNext(); await f.submit();
  assert.equal(f.state().entries.length, 0); assert.ok(find(f.render(), "form"));
  await f.submit(); let row = f.state().entries[0]; assert.equal(row.organization, "Synthetic issuer");
  button(f.row(row), "Edit").props.onClick();
  nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name").props.onChange({ target: { value: "Edited" } });
  await f.submit(); row = f.state().entries[0]; assert.equal(row.name, "Edited");
  button(f.row(row), "Delete").props.onClick(); button(f.render(), "Keep entry").props.onClick(); assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick(); service.failNext();
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 1);
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("pending writes are not duplicated and optional saved links are safe", async () => {
  const service = createCertificatesPreviewService(); let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ ...service, create: async draft => { calls++; await wait; return service.create(draft); } });
  button(f.render(), "Add certificate").props.onClick(); f.fill();
  const first = f.submit(); await f.submit(); assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  release(); await first;
  const row = { ...f.state().entries[0], credentialUrl: "https://example.invalid/credential" };
  const anchors = nodes(f.row(row)).filter(n => n.type === "a");
  assert.equal(nodes(f.row({ ...row, credentialUrl: "javascript:alert(1)" })).filter(n => n.type === "a").length, 0);
  assert.equal(anchors.length, 1); assert.equal(anchors[0].props.rel, "noopener noreferrer"); assert.equal(anchors[0].props.target, "_blank");
});
test("load errors retry, conflicts retain drafts and production preview returns 404", async () => {
  const service = createCertificatesPreviewService(); service.failNext(); const f = await fixture(service);
  assert.equal(f.state().kind, "error"); await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r)); assert.equal(f.state().kind, "ready");
  const conflicting = await fixture({ ...service, create: async () => { throw new model.CertificateConflict("Conflict"); } });
  button(conflicting.render(), "Add certificate").props.onClick(); conflicting.fill(); await conflicting.submit(); assert.match(JSON.stringify(conflicting.render()), /changed elsewhere/);
  const { default: Page } = await load("../src/app/dev/certificates/page.tsx", { "next/navigation": { notFound() { throw new Error("404"); } }, "@/components/dev/certificates-preview": { CertificatesPreview: "Preview" }, "react/jsx-runtime": runtime });
  const previous = process.env.NODE_ENV;
  try { process.env.NODE_ENV = "production"; assert.throws(() => Page(), /404/); process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview"); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test("unknown expiration stays distinct from explicit non-expiring; optional details are omitted", async () => {
  const service = createCertificatesPreviewService(), f = await fixture(service);
  const unknown = await service.create({ ...valid, issueDate: "", expirationDate: "" });
  assert.equal(unknown.doesNotExpire, false);
  assert.doesNotMatch(JSON.stringify(f.row(unknown)), /No expiration date|Issued |Credential ID |Show credential/);
  const never = await service.update(unknown.id, unknown.revision, { ...model.certificateDraft(unknown), doesNotExpire: true });
  assert.match(JSON.stringify(f.row(never)), /No expiration date/);
  assert.equal(never.expirationDate, "");
});

test("edit failures and Cancel preserve persisted details; delete conflicts retain the entry", async () => {
  const service = createCertificatesPreviewService(), f = await fixture(service);
  button(f.render(), "Add certificate").props.onClick(); f.fill(); await f.submit();
  const original = f.state().entries[0];
  button(f.row(original), "Edit").props.onClick();
  const name = () => nodes(f.render()).find(n => n.type === "Input" && n.props.name === "name");
  name().props.onChange({ target: { value: "Unsaved correction" } });
  service.failNext(); await f.submit();
  assert.equal(name().props.value, "Unsaved correction");
  assert.equal((await service.load())[0].name, original.name);
  button(f.render(), "Cancel").props.onClick();
  assert.equal(f.state().entries[0].name, original.name);
  button(f.row(original), "Edit").props.onClick();
  assert.equal(name().props.value, original.name);
  name().props.onChange({ target: { value: "Confirmed correction" } });
  await f.submit();
  const confirmed = f.state().entries[0];
  assert.equal(confirmed.name, "Confirmed correction");
  await service.update(confirmed.id, confirmed.revision, { ...model.certificateDraft(confirmed), credentialId: "Other update" });
  button(f.row(confirmed), "Delete").props.onClick();
  button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.equal(f.state().entries.length, 1);
  assert.match(JSON.stringify(f.render()), /changed elsewhere/);
});

test("delete duplicate submissions are blocked and confirmation Escape cancels safely", async () => {
  const service = createCertificatesPreviewService(); let calls = 0, release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ ...service, remove: async (...args) => { calls++; await wait; return service.remove(...args); } });
  button(f.render(), "Add certificate").props.onClick(); f.fill(); await f.submit();
  const row = f.state().entries[0];
  button(f.row(row), "Delete").props.onClick();
  nodes(f.render()).find(n => n.props?.["aria-label"] === "Confirm certificate deletion").props.onKeyDown({ key: "Escape" });
  assert.equal(button(f.render(), "Confirm delete"), undefined);
  assert.equal((await service.load()).length, 1);
  button(f.row(row), "Delete").props.onClick();
  button(f.render(), "Confirm delete").props.onClick();
  button(f.render(), "Deleting...").props.onClick();
  assert.equal(calls, 1); assert.equal(button(f.render(), "Keep entry").props.disabled, true);
  release(); await new Promise(r => setImmediate(r));
  assert.equal(f.state().entries.length, 0);
});
