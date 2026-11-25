import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path, replace = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replace)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const clientUrl = await moduleUrl("../src/lib/api/client.ts");
const { ApiError } = await import(clientUrl);
const { changeTracking } = await import(await moduleUrl("../src/lib/applications.ts", { '"./api/client"': JSON.stringify(clientUrl) }));
const opportunity = "00000000-0000-4000-8000-000000000001";
function form(intent, extra = {}) { const data = new FormData(); for (const [key, value] of Object.entries({ intent, opportunity_id: opportunity, ...extra })) data.set(key, value); return data; }
function fixture() {
  let items = []; const calls = [];
  return { calls, get items() { return items; }, async request(path, init = {}) {
    calls.push({ path, ...init });
    if (!init.method) return { items: structuredClone(items) };
    if (init.method === "POST") { const app = { id: "application-test", ...init.body, notes: null }; items.push(app); return structuredClone(app); }
    if (init.method === "PATCH") { items[0] = { ...items[0], ...init.body }; return structuredClone(items[0]); }
    if (init.method === "DELETE") { items = []; return; }
  } };
}
test("save, apply, all statuses, notes and remove use canonical server records", async () => {
  const api = fixture();
  assert.equal((await changeTracking(api, form("save"))).application.status, "saved");
  assert.equal((await changeTracking(api, form("apply"))).application.status, "applied");
  for (const status of ["interview", "offer", "rejected"]) {
    const result = await changeTracking(api, form("update", { status, notes: " Interview notes " }));
    assert.equal(result.application.status, status); assert.equal(result.application.notes, "Interview notes");
  }
  assert.equal((await changeTracking(api, form("save"))).application.status, "rejected");
  assert.equal(api.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal((await changeTracking(api, form("remove"))).application, null);
  assert.deepEqual(api.items, []);
});
test("invalid edits cannot make API calls", async () => {
  const api = fixture();
  for (const data of [form("update", { status: "invalid" }), form("save", { opportunity_id: "bad" }), form("update", { status: "offer", notes: "x".repeat(10001) })]) assert.ok((await changeTracking(api, data)).error);
  assert.equal(api.calls.length, 0);
});
test("404/422/network failures preserve confirmed state without false success", async () => {
  for (const status of [404, 422, 503]) {
    const api = fixture(); await changeTracking(api, form("save"));
    const original = api.request.bind(api);
    api.request = (path, init) => init?.method ? Promise.reject(new ApiError(status, "test")) : original(path, init);
    const result = await changeTracking(api, form("update", { status: "offer" }));
    assert.ok(result.error); assert.equal(result.message, ""); assert.equal(result.application.status, "saved");
  }
});
test("concurrent save conflict rereads canonical data", async () => {
  let count = 0;
  const saved = { id: "canonical-id", opportunity_id: opportunity, status: "saved" };
  const api = { async request(_path, init) {
    if (init?.method === "POST") throw new ApiError(409, "duplicate");
    return { items: ++count === 1 ? [] : [saved] };
  } };
  const result = await changeTracking(api, form("save"));
  assert.ok(result.error); assert.equal(result.application.id, "canonical-id"); assert.equal(count, 2);
});

async function loadRoute(file, dependencies) {
  const source = await readFile(new URL("../src/app/(workspace)/applications/" + file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, exports);
  return exports;
}

const jsx = (type, props) => ({ type, props });
const nodes = (node) => node?.props ? [node, ...[node.props.children].flat(Infinity).flatMap(nodes)] : [];

async function applicationsRoute(api) {
  const invalidations = [];
  const account = { requireCompletedAccount: async () => ({ api }) };
  const { default: page } = await loadRoute("page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "@/lib/auth/account": account,
    "@/components/ui/empty-state": { EmptyState: "EmptyState" },
    "@/components/ui/page-heading": { PageHeading: "PageHeading" },
    "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" },
    "@/lib/organization-logo": { organizationLogo: () => null },
    "@/components/applications/application-controls": { ApplicationControls: "Controls" },
  });
  const { updateTracking } = await loadRoute("actions.ts", {
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "@/lib/auth/account": account,
    "@/lib/applications": { changeTracking },
  });
  return { render: async (view) => nodes(await page({ searchParams: Promise.resolve({ view }) })),
    updateTracking, invalidations };
}

function application(status, opportunityId = opportunity) {
  return { id: "application-" + status, opportunity_id: opportunityId, status, notes: null,
    opportunity: { title: status + " fixture", organization: "Fixture" } };
}

function trackerView(tree) {
  const links = tree.filter(({ type, props }) => type === "Link" && props.href.startsWith("/applications?view="));
  return {
    active: links.find(({ props }) => props["aria-current"] === "page").props.href,
    counts: links.map(({ props }) => [props.href.split("=")[1], [props.children].flat().filter(Boolean).join("")]),
    rows: tree.filter(({ type }) => type === "Controls").map(({ props }) => props.application),
    empty: tree.find(({ type }) => type === "EmptyState")?.props.title,
  };
}

test("Applications counts the complete tracker and supports exact status and legacy Applied views", async () => {
  const api = fixture();
  const statuses = ["saved", "applied", "interview", "offer", "rejected"];
  api.items.push(...statuses.map((status) => application(status)));
  const { render } = await applicationsRoute(api);
  for (const status of statuses) {
    const view = status === "applied" ? "applied-only" : status;
    const page = trackerView(await render(view));
    assert.equal(page.active, "/applications?view=" + view);
    assert.deepEqual(page.rows.map((row) => row.status), [status]);
    assert.deepEqual(Object.fromEntries(page.counts), {
      all: "All", saved: "Saved (1)", applied: "Applied and later", "applied-only": "Applied (1)",
      interview: "Interview (1)", offer: "Offer (1)", rejected: "Rejected (1)",
    });
  }
  assert.deepEqual(trackerView(await render("applied")).rows.map((row) => row.status), statuses.slice(1));
  assert.equal(trackerView(await render(["saved", "offer"])).rows.length, 5);
  assert.ok(api.calls.every(({ path, method }) => path === "/api/v1/applications" && !method));
});

test("Save progress updates confirmed counts on the current filter and notes persist on a fresh read", async () => {
  const api = fixture();
  const saved = application("saved");
  api.items.push(saved);
  const { render, updateTracking, invalidations } = await applicationsRoute(api);
  const before = trackerView(await render("saved"));
  assert.equal(Object.fromEntries(before.counts).saved, "Saved (1)");
  const updated = await updateTracking({ application: saved }, form("update", { status: "applied", notes: "Follow up Friday" }));
  assert.equal(updated.application.status, "applied");
  assert.ok(invalidations.includes("/applications"));
  const after = trackerView(await render("saved"));
  assert.equal(after.active, before.active);
  assert.equal(after.empty, "No saved internships yet");
  assert.equal(Object.fromEntries(after.counts).saved, "Saved (0)");
  assert.equal(Object.fromEntries(after.counts)["applied-only"], "Applied (1)");
  const refreshed = trackerView(await render("applied-only"));
  assert.deepEqual(refreshed.rows.map(({ status, notes }) => [status, notes]), [["applied", "Follow up Friday"]]);
});

test("a failed Save progress leaves the Application counts and confirmed notes unchanged", async () => {
  const api = fixture();
  const saved = { ...application("saved"), notes: "Original notes" };
  api.items.push(saved);
  const { render, updateTracking } = await applicationsRoute(api);
  const before = trackerView(await render("saved"));
  const request = api.request.bind(api);
  api.request = (path, init) => init?.method === "PATCH" ? Promise.reject(new ApiError(503, "test")) : request(path, init);
  const failed = await updateTracking({ application: saved }, form("update", { status: "applied", notes: "Unconfirmed" }));
  assert.ok(failed.error);
  assert.deepEqual(trackerView(await render("saved")), before);
});
