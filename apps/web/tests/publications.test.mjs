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
const model = await load("../src/lib/publications.ts", { "./experience": dates, "./resume-link": links });
const { createPublicationsPreviewService } = await load("../src/lib/publications-preview-service.ts", { "./publications": model });
const valid = { ...model.emptyPublication(), title: "Synthetic publication", authors: "Author Z\nAuthor A\nDoe, Example", publisher: "Example journal", publicationDate: "2024-02", doi: "10.1000/example", description: "First line\nSecond line", publicationUrl: "https://example.invalid/publication" };
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && [n.props.children].flat()[0] === label);
async function fixture(service) {
  const values = [], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = {
    useId: () => "publications-fixture", useEffect: effect => effects.push(effect),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(current) { const index = refCursor++; return refs[index] ??= { current }; },
  };
  const { PublicationsSection } = await load("../src/components/profile/publications-section.tsx", {
    react, "react/jsx-runtime": runtime, "@/lib/publications": model, "@/lib/resume-link": links,
    "./collection-view": { CollectionView: "CollectionView" }, "@/components/ui/field": { Field: "Field", fieldControl: "" },
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const render = () => { cursor = 0; refCursor = 0; return PublicationsSection({ service }); };
  const initial = render(); effects[0](); await new Promise(r => setImmediate(r));
  const state = () => find(render(), "CollectionView").props.state;
  const fill = () => { for (const key of ["title", "publisher", "publicationDate", "publicationUrl", "doi"]) nodes(render()).find(n => n.type === "Input" && n.props.name === key).props.onChange({ target: { value: valid[key] } }); };
  return { initial, render, state, fill, row: entry => find(render(), "CollectionView").props.renderEntry(entry), submit: () => find(render(), "form").props.onSubmit({ preventDefault() {} }) };
}

test("required title and optional fields validate without inventing dates or authors", () => {
  assert.deepEqual(model.validatePublication(valid), {});
  assert.deepEqual(model.validatePublication({ ...model.emptyPublication(), title: "Publication" }), {});
  for (const title of ["", "   ", "x".repeat(256)]) assert.ok(model.validatePublication({ ...valid, title }).title);
  for (const publicationDate of ["2024-13", "2024-00", "2024-02-01", "1899", "2101", "unknown"]) assert.ok(model.validatePublication({ ...valid, publicationDate }).publicationDate);
  for (const publicationDate of ["", "   ", "2024", "2024-02"]) assert.deepEqual(model.validatePublication({ ...valid, publicationDate }), {});
  assert.ok(model.validatePublication({ ...valid, publisher: "x".repeat(256) }).publisher);
  assert.ok(model.validatePublication({ ...valid, description: "x".repeat(5001) }).description);
  assert.ok(model.validatePublication({ ...valid, authors: "x".repeat(256) }).authors);
  assert.ok(model.validatePublication({ ...valid, authors: Array(101).fill("Author").join("\n") }).authors);
  assert.deepEqual(model.publicationAuthors(""), []);
});
test("authors preserve entered order, commas and repeated names through edit conversion and CRUD", async () => {
  const service = createPublicationsPreviewService();
  const authors = " Author Z \r\nAuthor A\n\nDoe, Example\nAuthor A";
  const expected = ["Author Z", "Author A", "Doe, Example", "Author A"];
  assert.deepEqual(model.publicationAuthors(authors), expected);
  const row = await service.create({ ...valid, authors });
  assert.deepEqual(row.authors, expected);
  assert.deepEqual(model.publicationAuthors(model.publicationDraft(row).authors), expected);
  row.authors.reverse(); assert.deepEqual((await service.load())[0].authors, expected);
  const saved = (await service.load())[0];
  const changed = await service.update(saved.id, saved.revision, { ...model.publicationDraft(saved), authors: "Author A\nAuthor Z" });
  assert.deepEqual(changed.authors, ["Author A", "Author Z"]);
  const absent = await service.update(changed.id, changed.revision, { ...model.publicationDraft(changed), authors: "" });
  assert.deepEqual(absent.authors, []);
});
test("DOI identifier and resolver form normalize consistently with safely encoded links", () => {
  const raw = model.normalizeDoi(" 10.1000/Example ");
  assert.deepEqual(raw, { doi: "10.1000/Example", url: "https://doi.org/10.1000/Example" });
  assert.deepEqual(model.normalizeDoi("https://doi.org/10.1000/Example"), raw);
  assert.deepEqual(model.normalizeDoi("HTTPS://DOI.ORG/10.1000/Example"), raw);
  assert.deepEqual(model.normalizeDoi(""), { doi: "" });
  const special = model.normalizeDoi("10.1000/a/b?c#d%f");
  assert.equal(special.url, "https://doi.org/10.1000/a%2Fb%3Fc%23d%25f");
  assert.deepEqual(model.normalizeDoi(special.url), special);
  for (const doi of ["https://user:fake@doi.org/10.1000/x", "https://doi.org.evil.invalid/10.1000/x", "http://doi.org/10.1000/x", "javascript:alert(1)", "10.1000/", "10.1000/.", "10.1000/..", "https://doi.org/10.1000/x?query=x", "https://doi.org/10.1000/x#fragment", "https://doi.org/10.1000/%zz", "https://doi.org/10.1000/%00", "10.1000/a b", "10.1000/a\\b", "x".repeat(513)]) assert.ok(model.normalizeDoi(doi).error, doi);
});
test("optional publication URL accepts only absolute safe HTTP/HTTPS links", () => {
  for (const publicationUrl of ["javascript:alert(1)", "data:text/plain,x", "/relative", "//example.invalid", "https://user:fake@example.invalid", "https://@example.invalid", "https://example.invalid/a b", "x".repeat(513)]) assert.ok(model.validatePublication({ ...valid, publicationUrl }).publicationUrl);
  for (const publicationUrl of ["", "http://example.invalid/reference", valid.publicationUrl]) assert.deepEqual(model.validatePublication({ ...valid, publicationUrl }), {});
});
test("component authors textarea saves and reopens the confirmed ordered list", async () => {
  const service = createPublicationsPreviewService(), f = await fixture(service);
  button(f.render(), "Add publication").props.onClick(); f.fill();
  const authors = () => nodes(f.render()).find(n => n.type === "textarea" && n.props.name === "authors");
  authors().props.onChange({ target: { value: "Author Z\nAuthor A" } });
  await f.submit(); const row = f.state().entries[0]; assert.deepEqual(row.authors, ["Author Z", "Author A"]);
  button(f.row(row), "Edit").props.onClick(); assert.equal(authors().props.value, "Author Z\nAuthor A");
  authors().props.onChange({ target: { value: "Different author" } }); button(f.render(), "Cancel").props.onClick();
  assert.deepEqual((await service.load())[0].authors, ["Author Z", "Author A"]);
});
test("preview CRUD preserves stable IDs/order, date precision and response isolation", async () => {
  const service = createPublicationsPreviewService();
  assert.deepEqual(await service.load(), []);
  const first = await service.create({ ...valid, publicationDate: "2024" });
  const second = await service.create({ ...valid, title: "Another" });
  assert.equal(first.publicationDate, "2024");
  assert.equal(Object.hasOwn(model.publicationDraft(first), "id"), false);
  const edited = await service.update(first.id, first.revision, { ...valid, title: "Changed" });
  assert.equal(edited.id, first.id); assert.equal(edited.position, first.position); assert.equal(edited.revision, 2);
  assert.deepEqual((await service.load()).map(r => r.id), [first.id, second.id]);
  edited.title = "Not persisted"; assert.equal((await service.load())[0].title, "Changed");
  await assert.rejects(service.update(first.id, 1, valid), model.PublicationConflict);
  await service.remove(first.id, 2); assert.deepEqual((await service.load()).map(r => r.id), [second.id]);
  assert.deepEqual(await createPublicationsPreviewService().load(), []);
});
test("failure/conflict simulations are one-shot and do not mutate records", async () => {
  const service = createPublicationsPreviewService(), row = await service.create(valid);
  for (const operation of [() => service.load(), () => service.create(valid), () => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.failNext(); await assert.rejects(operation(), /Simulated/); assert.deepEqual(await service.load(), [row]);
  }
  for (const operation of [() => service.update(row.id, row.revision, valid), () => service.remove(row.id, row.revision)]) {
    service.conflictNext(); assert.deepEqual(await service.load(), [row]); await assert.rejects(operation(), model.PublicationConflict); assert.deepEqual(await service.load(), [row]);
  }
  await service.remove(row.id, row.revision);
});
test("real page validates drafts, never saves and Cancel/Escape discard edits", async () => {
  const f = await fixture();
  assert.equal(f.state().kind, "unconnected");
  button(f.render(), "Draft publication").props.onClick(); await f.submit();
  assert.ok(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.error);
  f.fill(); await f.submit();
  assert.equal(button(f.render(), "Saving unavailable").props.disabled, true);
  assert.ok(button(f.render(), "Validate draft")); assert.equal(f.state().kind, "unconnected");
  assert.match(JSON.stringify(f.render()), /Draft is valid.*has not been saved/);
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Draft publication").props.onClick();
  assert.equal(nodes(f.render()).find(n => n.type === "Input" && n.props.name === "title").props.value, "");
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.equal(find(f.render(), "form"), undefined);
});
test("component confirms CRUD, retains failed drafts/records and supports retry", async () => {
  const service = createPublicationsPreviewService(), f = await fixture(service);
  assert.equal(find(f.initial, "CollectionView").props.state.kind, "loading");
  button(f.render(), "Add publication").props.onClick(); f.fill();
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
  const service = createPublicationsPreviewService(); service.failNext(); const f = await fixture(service);
  assert.equal(f.state().kind, "error"); await find(f.render(), "CollectionView").props.onRetry(); await new Promise(r => setImmediate(r)); assert.equal(f.state().kind, "ready");
  button(f.render(), "Add publication").props.onClick(); f.fill(); await f.submit(); const row = f.state().entries[0];
  button(f.row(row), "Edit").props.onClick(); service.conflictNext(); await f.submit();
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.ok(find(f.render(), "form"));
  button(f.render(), "Cancel").props.onClick(); button(f.render(), "Reload publications").props.onClick(); await new Promise(r => setImmediate(r));
  button(f.row(row), "Delete").props.onClick(); service.conflictNext(); button(f.render(), "Confirm delete").props.onClick(); await new Promise(r => setImmediate(r));
  assert.match(JSON.stringify(f.render()), /changed elsewhere/); assert.equal(f.state().entries.length, 1);
  nodes(f.render()).find(n => n.props?.["aria-label"] === "Confirm publication deletion").props.onKeyDown({ key: "Escape" });
  assert.equal(button(f.render(), "Confirm delete"), undefined);
});
test("create/update/delete pending guards reject duplicate submissions and prevent cancellation", async () => {
  const service = createPublicationsPreviewService(); let release, calls = 0;
  let wait = new Promise(resolve => { release = resolve; });
  const slow = method => async (...args) => { calls++; await wait; return service[method](...args); };
  const f = await fixture({ ...service, create: slow("create"), update: slow("update"), remove: slow("remove") });
  button(f.render(), "Add publication").props.onClick(); f.fill();
  let first = f.submit(); await f.submit(); assert.equal(calls, 1); assert.equal(button(f.render(), "Cancel").props.disabled, true);
  find(f.render(), "form").props.onKeyDown({ key: "Escape" }); assert.ok(find(f.render(), "form"));
  release(); await first;
  let row = f.state().entries[0]; button(f.row(row), "Edit").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  first = f.submit(); await f.submit(); assert.equal(calls, 2); release(); await first;
  row = f.state().entries[0]; button(f.row(row), "Delete").props.onClick(); wait = new Promise(resolve => { release = resolve; });
  button(f.render(), "Confirm delete").props.onClick(); button(f.render(), "Deleting...").props.onClick(); assert.equal(calls, 3); assert.equal(button(f.render(), "Keep entry").props.disabled, true);
  release(); await new Promise(r => setImmediate(r)); assert.equal(f.state().entries.length, 0);
});
test("rendered authors stay ordered, text is not HTML and links are safe", async () => {
  const f = await fixture(); const row = { ...valid, authors: ["Author Z", "Author A", "Doe, Example"], id: "fixture", revision: 1, position: 1 };
  const rendered = f.row(row), anchors = nodes(rendered).filter(n => n.type === "a");
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) { assert.equal(anchor.props.rel, "noopener noreferrer"); assert.equal(anchor.props.target, "_blank"); }
  const list = nodes(rendered).find(n => n.type === "ol");
  assert.deepEqual(nodes(list).filter(n => n.type === "li").map(n => n.props.children), row.authors);
  const malicious = f.row({ ...row, title: "<script>example</script>", description: "<b>Plain text</b>", publicationUrl: "javascript:alert(1)", doi: "javascript:alert(1)" });
  assert.equal(nodes(malicious).filter(n => n.type === "a").length, 0);
  assert.ok(nodes(malicious).every(n => !n.props.dangerouslySetInnerHTML));
  assert.equal(nodes(malicious).find(n => n.type === "h3").props.children, "<script>example</script>");
  const minimal = f.row({ ...model.emptyPublication(), title: "Publication", authors: [], id: "minimal", revision: 1, position: 2 });
  assert.equal(nodes(minimal).filter(n => ["p", "a", "ol"].includes(n.type)).length, 0);
});
test("preview rejects production/test and renders only in development", async () => {
  const { default: Page } = await load("../src/app/dev/publications/page.tsx", { "next/navigation": { notFound() { throw new Error("404"); } }, "@/components/dev/publications-preview": { PublicationsPreview: "Preview" }, "react/jsx-runtime": runtime });
  const previous = process.env.NODE_ENV;
  try { for (const mode of ["production", "test"]) { process.env.NODE_ENV = mode; assert.throws(() => Page(), /404/); } process.env.NODE_ENV = "development"; assert.equal(Page().type, "Preview"); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test("preview stores a normalized DOI identifier and preserves it through editing", async () => {
  const service = createPublicationsPreviewService();
  const row = await service.create({ ...valid, doi: "https://doi.org/10.1000/a%2Fb%3Fc%23d" });
  assert.equal(row.doi, "10.1000/a/b?c#d");
  const changed = await service.update(row.id, row.revision, { ...model.publicationDraft(row), title: "Edited" });
  assert.equal(changed.doi, row.doi); assert.deepEqual(changed.authors, row.authors);
  const cleared = await service.update(changed.id, changed.revision, { ...model.publicationDraft(changed), doi: "", publicationDate: "" });
  assert.equal(cleared.doi, ""); assert.equal(cleared.publicationDate, "");
});
