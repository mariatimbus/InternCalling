import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, "Unexpected dependency " + name);
    return dependencies[name];
  }, exports);
  return exports;
}

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx };
const nodes = (tree) => tree?.props ? [tree, ...[tree.props.children].flat(Infinity).flatMap(nodes)] : [];
const jobs = "../src/app/(workspace)/jobs/";
const id = "00000000-0000-4000-8000-000000000001";
const opportunity = { id, title: "Engineering intern", opportunity_type: "internship", url: "https://example.invalid/role" };
const row = (status, entry = opportunity) => ({
  id: "tracker-" + entry.id, opportunity_id: entry.id, status,
  opportunity: { id: entry.id, title: entry.title, opportunity_type: entry.opportunity_type, organization: null, deadline: null },
  applied_at: status === "saved" ? null : "2026-11-01T00:00:00Z", notes: "Keep this history",
});
const { ApiError } = await load("../src/lib/api/client.ts");
const jobsUrl = await load("../src/lib/jobs-url.ts");
const detailUi = await load("../src/components/jobs/opportunity-details.tsx", {
  "react/jsx-runtime": runtime, "@/components/ui/badge": { Badge: "Badge" },
});

async function fixture(request) {
  const calls = [];
  const invalidated = [];
  const account = { requireCompletedAccount: async () => ({ api: { request: async (path, init) => {
    calls.push([path, init]);
    return request(path, init);
  } } }) };
  const action = await load(jobs + "save-action.ts", {
    "next/cache": { revalidatePath: (path) => invalidated.push(path) },
    "@/lib/auth/account": account, "@/lib/api/client": { ApiError },
  });
  const { default: page } = await load(jobs + "page.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "Link" }, "@/lib/auth/account": account,
    "@/components/workspace/recommended-jobs": { RecommendedJobs: "JobsList" },
    "@/components/jobs/jobs-search": { JobsSearch: "JobsSearch" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/empty-state": { EmptyState: "Empty" }, "@/components/ui/error-state": { ErrorState: "Error" },
    "./save-action": action,
    "@/lib/jobs-url": jobsUrl,
  });
  return { calls, invalidated, save: action.saveOpportunity, visit: async (query = {}) => nodes(await page({ searchParams: Promise.resolve(query) })) };
}

const queryOf = (href) => Object.fromEntries(new URL(href, "https://fixture.invalid").searchParams);
const tab = (tree, label) => tree.find((node) => node.type === "Link" && node.props.children === label);
const list = (tree) => tree.find((node) => node.type === "JobsList")?.props;

async function searchFixture(initial) {
  const history = [];
  const states = [];
  let cursor = 0;
  let id = 0;
  const { JobsSearch } = await load("../src/components/jobs/jobs-search.tsx", {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useId: () => "jobs-" + ++id,
      useState: (initialValue) => {
        const slot = cursor++;
        if (!(slot in states)) states[slot] = initialValue;
        return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
      },
    },
    "react/jsx-runtime": runtime, "next/navigation": { useRouter: () => ({ push: (url) => history.push(url) }) },
    "@/components/ui/button": { Button: "Button" }, "@/components/ui/drawer": { Drawer: "Drawer" },
    "@/components/ui/icon": { Icon: "Icon" }, "@/components/ui/input": { Input: "Input" },
    "@/components/ui/select": { Select: "Select" },
  });
  function render(props = initial) {
    id = 0;
    cursor = 0;
    return nodes(JobsSearch({ navigationKey: "/jobs", ...props }));
  }
  const input = () => render().find((node) => node.props.role === "combobox").props;
  return { history, render, input };
}

const submit = { preventDefault() {} };
const keyEvent = (key) => ({ ...submit, key, nativeEvent: { isComposing: false } });
const change = (value) => ({ target: { value } });

test("unavailable drawer sections are disabled and cannot enter Jobs requests or filter state", async () => {
  const app = await fixture((path) => path.endsWith("/applications") ? { items: [] } : { items: [], page_size: 12, total: 0 });
  const live = { location: "Berlin", degree_level: "master", study_year: "1" };
  const unknown = {
    schedule: "part_time", work_model: "remote", posted_after: "2026-11-01",
    industry_id: "unknown", required_experience: "1",
  };
  const page = await app.visit({ q: "python", ...live, ...unknown });
  const search = page.find((node) => node.type === "JobsSearch").props;
  assert.deepEqual(search.applied, live);
  assert.deepEqual(queryOf(tab(page, "Saved").props.href), { view: "saved", q: "python", page: "1", ...live });
  const box = await searchFixture(search);
  const trigger = () => box.render().find((node) => node.props["aria-haspopup"] === "dialog");
  assert.ok(trigger().props.children.flat().includes(" (2)"));
  trigger().props.onClick();
  const form = box.render().find((node) => node.type === "Drawer").props.children;
  const sections = nodes(form).filter((node) => node.type === "fieldset");
  assert.deepEqual(sections.map((section) => {
    assert.equal(section.props.disabled, true);
    const children = nodes(section);
    assert.ok(children.some((node) => node.props.children === "Not available yet"));
    const controls = children.filter((node) => node.type === "input" || node.type === "Input");
    assert.ok(controls.every((node) => !node.props.name && !node.props.onChange));
    return [
      children.find((node) => node.type === "legend").props.children,
      children.filter((node) => node.type === "label").map((node) => node.props.children.at(-1)),
    ];
  }), [
    ["Schedule", ["Full-time", "Part-time"]],
    ["Work Model", ["Remote", "Hybrid", "On-site"]],
    ["Date Posted", ["Past 24 hours", "Past 3 days", "Past week", "Past month"]],
    ["Industry", []],
  ]);
  const industry = nodes(sections.at(-1)).find((node) => node.type === "Input");
  assert.equal(industry.props.disabled, true);
  assert.equal(industry.props.type, "search");
  const experience = nodes(form).find((node) => node.type === "section");
  assert.deepEqual(nodes(experience).slice(1).map((node) => node.props.children), ["Required Experience", "Not available yet"]);
  form.props.onSubmit(submit);
  const appliedUrl = queryOf(box.history.at(-1));
  assert.deepEqual(appliedUrl, { q: "python", ...live });
  await app.visit(appliedUrl);
  const requests = app.calls.filter(([path]) => path.includes("opportunities/recommended?")).map(([path]) => queryOf(path));
  assert.deepEqual(requests, Array(2).fill({
    ...live, opportunity_type: "internship", is_active: "true", page: "1", page_size: "12", search: "python",
  }));
});

test("suggestions are case-insensitive, prioritize prefixes, and only search on selection or submit", async () => {
  const applied = { location: "Berlin", degree_level: "master", study_year: "1" };
  const box = await searchFixture({ search: "", applied });
  const options = () => box.render().filter((node) => node.props.role === "option");
  box.input().onChange(change("SOFT"));
  assert.deepEqual(options().map((item) => item.props.children), ["Software Engineering", "Embedded Systems Engineering"]);
  assert.deepEqual(box.history, []);
  box.input().onKeyDown(keyEvent("ArrowUp"));
  assert.equal(options().at(-1).props["aria-selected"], true);
  box.input().onKeyDown(keyEvent("Escape"));
  assert.equal(box.input()["aria-expanded"], false);
  assert.deepEqual(box.history, []);
  box.input().onChange(change("FIRMWARE"));
  assert.equal(options()[0].props.children, "Embedded Systems Engineering");
  box.input().onKeyDown(keyEvent("ArrowDown"));
  box.input().onKeyDown(keyEvent("Enter"));
  assert.deepEqual(queryOf(box.history.at(-1)), { q: "embedded", ...applied });
  box.input().onChange(change("swe"));
  options()[0].props.onClick();
  assert.deepEqual(queryOf(box.history.at(-1)), { q: "software", ...applied });
  box.input().onChange(change("unlisted term"));
  assert.equal(options().length, 0);
  box.render().find((node) => node.type === "form" && node.props.action === "/jobs").props.onSubmit(submit);
  assert.deepEqual(queryOf(box.history.at(-1)), { q: "unlisted term", ...applied });
  box.input().onChange(change("a"));
  assert.ok(options().length <= 5);
  const historyPage = { search: "software", applied, navigationKey: "/jobs?q=software&page=2" };
  box.render(historyPage);
  const restoredInput = box.render(historyPage).find((node) => node.props.role === "combobox");
  assert.equal(restoredInput.props.value, "software");
  assert.equal(restoredInput.props["aria-expanded"], false);
});

test("drawer drafts are discarded on close and academic selections submit distinct A7 pairs", async () => {
  const applied = { location: "Berlin", degree_level: "bachelor", study_year: "1" };
  const box = await searchFixture({ search: "python", applied });
  const trigger = () => box.render().find((node) => node.props["aria-haspopup"] === "dialog");
  const drawer = () => box.render().find((node) => node.type === "Drawer").props;
  const field = (type) => nodes(drawer().children).find((node) => node.type === type);
  assert.ok(trigger().props.children.flat().includes(" (2)"));
  trigger().props.onClick();
  assert.equal(drawer().size, "skills");
  assert.equal(drawer().open, true);
  const study = field("Select");
  assert.deepEqual(nodes(study).filter((node) => node.type === "option").slice(1, 7).map((node) => node.props.children), [
    "Undergraduate first year", "Undergraduate second year", "Undergraduate third year", "Undergraduate fourth year", "Master’s first year", "Master’s second year",
  ]);
  field("Input").props.onChange(change("Paris"));
  field("Select").props.onChange(change("master:1"));
  assert.deepEqual(box.history, []);
  drawer().onClose();
  trigger().props.onClick();
  assert.equal(field("Input").props.value, "Berlin");
  assert.equal(field("Select").props.value, "bachelor:1");
  drawer().children.props.onSubmit(submit);
  trigger().props.onClick();
  field("Select").props.onChange(change("master:1"));
  drawer().children.props.onSubmit(submit);

  const app = await fixture((path) => path.endsWith("/applications") ? { items: [] } : { items: [], page_size: 12, total: 0 });
  for (const [index, degree] of ["bachelor", "master"].entries()) {
    await app.visit(queryOf(box.history[index]));
    assert.deepEqual(queryOf(app.calls.filter(([path]) => path.includes("opportunities/recommended?")).at(-1)[0]), {
      opportunity_type: "internship", is_active: "true", page: "1", page_size: "12",
      search: "python", location: "Berlin", degree_level: degree, study_year: "1",
    });
  }
  trigger().props.onClick();
  nodes(drawer().footer).find((node) => node.props.children === "Clear filters").props.onClick();
  assert.equal(box.history.length, 2);
  assert.equal(field("Select").props.value, ":");
  drawer().children.props.onSubmit(submit);
  assert.deepEqual(queryOf(box.history.at(-1)), { q: "python" });
});

test("removing an applied filter keeps the keyword and other filters and resets pagination", async () => {
  const applied = { location: "Berlin", degree_level: "master", study_year: "1" };
  const box = await searchFixture({ search: "quant", applied, navigationKey: "/jobs?q=quant&page=3" });
  const click = (label) => box.render().find((node) => node.props["aria-label"]?.startsWith(label)).props.onClick();
  click("Remove location filter");
  click("Remove education filter");
  assert.deepEqual(box.history.map(queryOf), [
    { q: "quant", degree_level: "master", study_year: "1" },
    { q: "quant", location: "Berlin" },
  ]);
  const app = await fixture((path) => path.endsWith("/applications") ? { items: [] } : { items: [], page_size: 12, total: 0 });
  await app.visit(queryOf(box.history[0]));
  const catalog = app.calls.find(([path]) => path.includes("opportunities/recommended?"))[0];
  assert.deepEqual(queryOf(catalog), {
    opportunity_type: "internship", is_active: "true", page: "1", page_size: "12",
    search: "quant", degree_level: "master", study_year: "1",
  });
});

test("Jobs links preserve q/page across views and Recommended ignores legacy types", async () => {
  const saved = row("saved", { id: "different", title: "Inactive research", opportunity_type: "research" });
  const tracked = [saved, ...["applied", "interview", "offer"].map((status) =>
    row(status, { ...opportunity, id: status })), row("rejected")];
  const app = await fixture((path) => {
    if (path.endsWith("/applications")) return { items: tracked };
    if (path.endsWith("/match")) return { score: 42 };
    return { items: [{ opportunity, match: { score: 42 }, eligibility: { status: "unknown", reasons: [] } }], page_size: 12, total: 36 };
  });
  const search = "  C++ & Python  ";
  const filters = { location: "Berlin & Paris", degree_level: "bachelor", study_year: "2" };
  const recommended = await app.visit({ q: search, page: "2", type: ["job", "hackathon"], ...filters });
  assert.deepEqual(queryOf(app.calls.find(([path]) => path.includes("opportunities/recommended?"))[0]), {
    opportunity_type: "internship", is_active: "true", page: "2", page_size: "12", search: "C++ & Python", ...filters,
  });
  assert.equal(tab(recommended, "Recommended").props["aria-current"], "page");
  assert.equal(list(recommended).items[0].match.score, 42);
  assert.ok(app.calls.every(([path]) => !path.endsWith("/match")), "ranking arrives from the global endpoint without per-page scoring calls");
  assert.equal(list(recommended).items[0].status, "rejected");
  assert.deepEqual(queryOf(tab(recommended, "Next page").props.href), { view: "recommended", q: search, page: "3", ...filters });
  assert.deepEqual(queryOf(tab(recommended, "Previous page").props.href), { view: "recommended", q: search, page: "1", ...filters });
  const discovery = recommended.find((node) => node.type === "JobsSearch").props;
  assert.deepEqual(discovery.applied, filters);
  assert.equal(discovery.search, search);
  app.calls.length = 0;
  const savedQuery = queryOf(tab(recommended, "Saved").props.href);
  const savedPage = await app.visit(savedQuery);
  assert.deepEqual(list(savedPage).items.map((item) => item.opportunity.title), ["Inactive research"]);
  assert.equal(list(savedPage).saveAction, undefined);
  assert.ok(!savedPage.some((node) => node.type === "JobsSearch"));
  const appliedPage = await app.visit(queryOf(tab(savedPage, "Applied").props.href));
  for (const [active, screen] of [["Recommended", recommended], ["Saved", savedPage], ["Applied", appliedPage]]) {
    const track = screen.find((node) => node.props["aria-label"] === "Job lists");
    assert.match(track.props.className, /segmented-track/);
    const tabs = nodes(track).filter((node) => node.type === "Link");
    assert.deepEqual(tabs.map((node) => node.props.children), ["Recommended", "Saved", "Applied"]);
    assert.ok(tabs.every((node) => node.props.className === "segmented-link"));
    assert.deepEqual(tabs.filter((node) => node.props["aria-current"] === "page").map((node) => node.props.children), [active]);
    assert.ok(screen.indexOf(track) < screen.findIndex((node) => node.props.className?.includes("tabular-nums")));
  }
  assert.ok(recommended.findIndex((node) => node.type === "JobsSearch") <
    recommended.findIndex((node) => node.props["aria-label"] === "Job lists"));
  assert.deepEqual(list(appliedPage).items.map((item) => item.status), ["applied", "interview", "offer", "rejected"]);
  assert.ok(!appliedPage.some((node) => node.type === "JobsSearch"));
  assert.ok(app.calls.every(([path]) => path === "/api/v1/applications"));
  assert.deepEqual(queryOf(tab(appliedPage, "Recommended").props.href), { view: "recommended", q: search, page: "2", ...filters });
  const restored = await app.visit(queryOf(tab(appliedPage, "Recommended").props.href));
  assert.deepEqual(restored.find((node) => node.type === "JobsSearch").props, discovery);
  const listingQuery = () => queryOf(app.calls.filter(([path]) => path.includes("opportunities/recommended?")).at(-1)[0]);
  const fixed = { opportunity_type: "internship", is_active: "true", page: "1", page_size: "12" };
  await app.visit({ q: "engineer", ...filters, location: "  Bucharest  " });
  assert.deepEqual(listingQuery(), { ...fixed, ...filters, location: "Bucharest", search: "engineer" });
  await app.visit();
  assert.deepEqual(listingQuery(), fixed);
  await app.visit({ view: "unknown", q: "   ", page: "0", type: "job", opportunity_type: "job",
    is_active: "false", location: ["Berlin", "Paris"], degree_level: "doctorate", study_year: "7" });
  assert.deepEqual(listingQuery(), fixed);
});

test("each view has distinct empty/error copy and retry keeps URL state", async () => {
  let fail = false;
  const app = await fixture((path) => {
    if (fail) throw new ApiError(503, "network_error");
    return path.endsWith("/applications") ? { items: [] } : { items: [], page_size: 12, total: 0 };
  });
  const empty = [];
  const errors = [];
  for (const view of ["recommended", "saved", "applied"]) {
    fail = false;
    empty.push((await app.visit({ view })).find((node) => node.type === "Empty").props.title);
    fail = true;
    const errored = await app.visit({ view, q: "python", page: "3", location: "Berlin", degree_level: "both", study_year: "6" });
    const error = errored.find((node) => node.type === "Error");
    errors.push(error.props.title);
    const inputs = nodes(error.props.action).filter((node) => node.type === "input");
    assert.deepEqual(Object.fromEntries(inputs.map(({ props }) => [props.name, String(props.value)])),
      { view, q: "python", page: "3", location: "Berlin", degree_level: "both", study_year: "6" });
  }
  assert.equal(new Set(empty).size, 3);
  assert.equal(new Set(errors).size, 3);
});

test("Save posts only saved status, persists on a fresh Saved read, and a repeat is read-only", async () => {
  const records = [];
  const app = await fixture((path, init) => {
    assert.equal(path, "/api/v1/applications");
    if (!init) return { items: records };
    assert.deepEqual(init, { method: "POST", body: { opportunity_id: id, status: "saved" } });
    const saved = row("saved");
    records.push(saved);
    return saved;
  });
  assert.deepEqual(await app.save(id), { status: "saved" });
  assert.deepEqual(app.invalidated, ["/jobs", "/applications"]);
  const fresh = await app.visit({ view: "saved" });
  assert.equal(list(fresh).items[0].opportunity.id, id);
  assert.deepEqual(await app.save(id), { status: "saved" });
  assert.equal(app.calls.filter(([, init]) => init).length, 1);
});

test("Save reconciles a conflict with existing saved or applied status without writing history", async () => {
  for (const status of ["saved", "interview"]) {
    const existing = row(status);
    const snapshot = structuredClone(existing);
    let records = [];
    const app = await fixture((_, init) => {
      if (!init) return { items: records };
      assert.equal(init.method, "POST");
      records = [existing];
      throw new ApiError(409, "api_error");
    });
    assert.deepEqual(await app.save(id), { status });
    assert.deepEqual(app.calls.map(([, init]) => init?.method ?? "GET"), ["GET", "POST", "GET"]);
    assert.deepEqual(existing, snapshot);
  }
  const app = await fixture(() => ({ items: [row("applied")] }));
  assert.deepEqual(await app.save(id), { status: "applied" });
  assert.deepEqual(app.calls.map(([, init]) => init?.method ?? "GET"), ["GET"]);
});

test("unconfirmed saves remain retryable, including failed conflict reconciliation", async () => {
  for (const failure of ["read", "post", "conflict", "conflict-read", "malformed"]) {
    let retry = false;
    let readCount = 0;
    const app = await fixture((_, init) => {
      if (!init) {
        readCount += 1;
        if (!retry && (failure === "read" || (failure === "conflict-read" && readCount === 2))) throw new ApiError(503, "network_error");
        return { items: [] };
      }
      if (retry) return row("saved");
      if (failure === "malformed") return { ...row("saved"), opportunity_id: "wrong" };
      throw new ApiError(failure.startsWith("conflict") ? 409 : 503, "api_error");
    });
    const failed = await app.save(id);
    assert.match(failed.error, /try again/i);
    assert.equal("status" in failed, false);
    assert.deepEqual(app.invalidated, []);
    retry = true;
    assert.deepEqual(await app.save(id), { status: "saved" });
  }
});

test("the card shows pending, blocks repeated clicks, and only displays the confirmed status", async () => {
  let transition;
  let pending = false;
  let result;
  const lock = { current: false };
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState: (initial) => initial === undefined ? [result, (value) => { result = value; }] : [initial, () => {}],
      useRef: () => lock,
      useTransition: () => [pending, (callback) => {
        pending = true;
        transition = callback().finally(() => { pending = false; });
      }],
    },
    "react/jsx-runtime": runtime, "@/lib/opportunities": { opportunitySummary: () => ({}) },
    "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/jobs/match-score": { MatchScore: "MatchScore" },
    "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
    "@/components/jobs/opportunity-details": detailUi, "next/link": { default: "Link" },
    "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" }, "@/components/ui/icon": { Icon: "Icon" },
  });
  let complete;
  let attempts = 0;
  const saveAction = () => {
    attempts += 1;
    return new Promise((resolve) => { complete = resolve; });
  };
  const render = () => {
    const card = nodes(RecommendedJobs({ items: [{ opportunity, match: null }], saveAction }))
      .find((node) => node.type === "JobCard");
    const control = card.props.action;
    return nodes(control.type(control.props));
  };
  const firstClick = render().find((node) => node.type === "Button").props.onClick;
  firstClick();
  firstClick();
  assert.equal(attempts, 1);
  assert.equal(render().find((node) => node.type === "Button").props.disabled, true);
  assert.ok(!render().some((node) => node.type === "Badge"));
  complete({ error: "Try again." });
  await transition;
  assert.equal(render().find((node) => node.props.role === "alert").props.children, "Try again.");
  render().find((node) => node.type === "Button").props.onClick();
  complete({ status: "offer" });
  await transition;
  assert.equal(render().find((node) => node.type === "Badge").props.children, "offer");
  assert.ok(!render().some((node) => node.type === "Button"));
});

test("cards omit unknown metadata and keep official links, selection and Save independent", async () => {
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useState: (value) => [value, () => {}] },
    "react/jsx-runtime": runtime, "@/lib/opportunities": {
      opportunitySummary: (job) => ({ title: job.title, company: "Fixture" }), opportunityTypeLabel: (type) => type,
    },
    "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/jobs/match-score": { MatchScore: "MatchScore" },
    "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
    "@/components/jobs/opportunity-details": detailUi, "next/link": { default: "Link" },
    "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" }, "@/components/ui/icon": { Icon: "Icon" },
  });
  const saveAction = () => { throw new Error("Rendering a link must not save"); };
  const listings = [
    { opportunity: { ...opportunity, deadline: "2026-12-20T00:00:00Z", posted_at: "2026-11-10T00:00:00", degree_level: "both", study_year: [2, 3] }, match: null },
    { opportunity: { ...opportunity, id: "unknown", url: "https://user:pass@example.invalid", deadline: null, posted_at: "invalid", degree_level: null, study_year: [], graduation_year: 2027 }, match: null },
    { opportunity: row("offer", { ...opportunity, id: "tracked" }).opportunity, status: "offer", match: null },
  ];
  const context = "view=applied&q=robotics&location=Berlin&degree_level=master&study_year=1&page=2";
  const logoFixture = "/company-logos/example.png";
  const trackedTree = nodes(RecommendedJobs({ items: [{ ...listings[2], companyLogoUrl: logoFixture }], detailContext: context }));
  assert.equal(trackedTree.find((node) => node.type === "JobCard").props.job.companyLogoUrl, logoFixture);
  const briefs = trackedTree.filter((node) => typeof node.type === "function" && node.type.name === "Brief");
  assert.equal(briefs.length, 2, "desktop panel and mobile drawer share the same brief");
  for (const { type: Brief, props } of briefs) {
    const brief = nodes(Brief(props));
    const link = tab(brief, "View full details");
    assert.equal(link.props.href, "/opportunities/tracked?" + context);
    assert.deepEqual(brief.find((node) => node.type === "CompanyAvatar").props, { companyName: undefined, initials: "–", logoUrl: logoFixture });
  }
  const [known, unknown, tracked] = nodes(RecommendedJobs({ items: listings, saveAction }))
    .filter((node) => node.type === "JobCard").map((node) => node.props);
  assert.deepEqual(known.metadata, [
    { label: "Deadline", value: "20/12/2026" },
    { label: "Posted", value: "10/11/2026" },
    { label: "Degree level", value: "Bachelor’s or master’s" },
    { label: "Study year", value: "2, 3" },
  ]);
  assert.deepEqual(unknown.metadata, []);
  assert.equal(unknown.officialUrl, null);
  assert.equal(tracked.officialUrl, null);
  assert.equal(tracked.job.initials, "–");
  assert.equal(tracked.action.props.item.status, "offer");
  assert.equal(known.action.props.saveAction, saveAction);

  const { JobCard } = await load("../src/components/jobs/job-card.tsx", {
    "react/jsx-runtime": runtime, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" },
    "./opportunity-card-content": { OpportunityCardContent: "Content", opportunityCardClasses: () => "group relative" },
  });
  let selections = 0;
  const card = nodes(JobCard({ ...known, onSelect: () => { selections += 1; } }));
  const link = card.find((node) => node.type === "a");
  const content = card.find((node) => node.type === "Content");
  assert.equal(link.props.href, opportunity.url);
  assert.equal(link.props.target, "_blank");
  assert.equal(link.props.rel, "noopener noreferrer");
  assert.equal(link.props.onClick, undefined);
  assert.match(link.props.className, /relative z-10/);
  assert.ok(nodes(link).some((node) => node.props.name === "external-link"));
  assert.equal(content.props.action, known.action);
  nodes(content.props.heading).find((node) => node.type === "button").props.onClick();
  assert.equal(selections, 1);
});

test("company avatars keep a fixed frame, reject unsupported URLs and recover when the logo changes", async () => {
  const avatarJsx = (type, props, key) => ({ type, props, key });
  const failures = new Map();
  let rendering;
  const mark = await load("../src/components/jobs/company-mark.tsx", { "react/jsx-runtime": runtime });
  const { CompanyAvatar } = await load("../src/components/jobs/company-avatar.tsx", {
    "react/jsx-runtime": { jsx: avatarJsx, jsxs: avatarJsx },
    "next/image": { default: "Image" }, "./company-mark": mark,
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useState: (initial) => {
      const key = rendering;
      return [failures.get(key) ?? initial, (value) => failures.set(key, value)];
    } },
  });
  function mount(props) {
    const avatar = CompanyAvatar(props);
    rendering = avatar.key;
    const frame = avatar.type(avatar.props);
    return typeof frame.type === "function" ? frame.type(frame.props) : frame;
  }
  const first = "/company-logos/example.png";
  const second = "/company-logos/other.webp";
  const frame = mount({ companyName: "Example", initials: "EX", logoUrl: first, size: "sm" });
  const supplied = frame.props.children;
  assert.equal(supplied.type, "Image");
  assert.equal(supplied.props.src, first);
  assert.equal(supplied.props.alt, "");
  assert.equal(supplied.props.width, 40);
  assert.match(supplied.props.className, /object-contain/);
  assert.match(frame.props.className, /\bsize-10\b/);
  supplied.props.onError();
  const failed = mount({ companyName: "Example", initials: "EX", logoUrl: first, size: "sm" });
  assert.equal(failed.props.children, "EX");
  assert.match(failed.props.className, /\bsize-10\b/);
  assert.equal(mount({ companyName: "Example", initials: "EX", logoUrl: second, size: "sm" }).props.children.props.src, second);
  assert.equal(mount({ companyName: "Example Two", initials: "EX", logoUrl: first, size: "sm" }).props.children.props.src, first);
  supplied.props.onError();
  assert.equal(mount({ companyName: "Example", initials: "EX", logoUrl: second }).props.children.props.width, 48);
  for (const logoUrl of [undefined, "//example.invalid/logo.png", "https://example.invalid/company-logos/ex.png",
    "/company-logos/../logo.png", "/company-logos/ex.png?redirect=1", "data:image/png;base64,eA=="]) {
    const fallback = mount({ logoUrl });
    assert.equal(fallback.props.children, "–");
    assert.match(fallback.props.className, /\bsize-12\b/);
  }
});

test("compact cards retain long metadata, meaningful eligibility and top-row actions", async () => {
  const { OpportunityCardContent, opportunityCardClasses } = await load("../src/components/jobs/opportunity-card-content.tsx", {
    "react/jsx-runtime": runtime, "@/components/ui/badge": { Badge: "Badge" }, "@/components/ui/icon": { Icon: "Icon" },
    "./company-mark": { CompanyMark: "CompanyMark" }, "./company-avatar": { CompanyAvatar: "CompanyAvatar" },
    "./eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "./match-score": { MatchScore: "MatchScore" },
  });
  const location = "Berlin, Frankfurt am Main, Munich, London, and Zürich";
  const job = { company: "QuantCo", initials: "QU", companyLogoUrl: "/company-logos/example.png", skills: [],
    location, eligibility: "eligible", matchScore: 84, description: "Research and engineering." };
  const action = jsx("TrackerBadge", { children: "Saved" });
  const compact = nodes(OpportunityCardContent({ job, density: "compact", action }));
  assert.deepEqual(compact.find((node) => node.type === "CompanyAvatar").props,
    { companyName: job.company, initials: "QU", logoUrl: job.companyLogoUrl, size: "sm" });
  assert.ok(compact.some((node) => node.props.children === job.company));
  assert.ok(compact.some((node) => node.props.children === location));
  assert.equal(compact.find((node) => node.type === "MatchScore").props.score, 84);
  assert.ok(compact.findIndex((node) => node.type === "TrackerBadge") < compact.findIndex((node) => node.type === "EligibilityBadge"));
  assert.match(compact.find((node) => node.props.children === job.description).props.className, /line-clamp-2/);
  assert.match(opportunityCardClasses(true, "compact"), /border-s-4.*border-s-accent/);
  assert.match(opportunityCardClasses(false, "compact"), /border-s-4.*border-s-transparent/);
  assert.doesNotMatch(opportunityCardClasses(false, "compact"), /\b(?:h-full|min-h-)\b/);
  const sparse = nodes(OpportunityCardContent({ job: { ...job, eligibility: "unknown", matchScore: null, description: undefined }, density: "compact" }));
  assert.equal(sparse.find((node) => node.type === "MatchScore").props.score, null);
  assert.ok(!sparse.some((node) => node.type === "EligibilityBadge"));
  assert.ok(nodes(OpportunityCardContent({ job })).some((node) => node.type === "CompanyMark"));
});

async function detailPage(requireCompletedAccount) {
  const { default: render } = await load("../src/app/(workspace)/opportunities/[id]/page.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "Link" }, "@/lib/auth/account": { requireCompletedAccount },
    "@/components/jobs/opportunity-details": detailUi, "@/components/ui/button": { Button: "Button" },
    "@/components/ui/error-state": { ErrorState: "Error" }, "@/lib/api/client": { ApiError }, "@/lib/jobs-url": jobsUrl,
  });
  return async (routeId = id, query = {}) => nodes(await render({
    params: Promise.resolve({ id: routeId }), searchParams: Promise.resolve(query),
  }));
}

test("direct detail reads only the public A7 record after the account guard and restores a safe Jobs URL", async () => {
  const calls = [];
  const page = await detailPage(async () => ({
    api: { request: async (...args) => {
      calls.push(args);
      return { ...opportunity, is_active: true, skills: [] };
    } },
  }));
  const direct = await page();
  assert.equal(tab(direct, "Back to Jobs").props.href, "/jobs");
  assert.equal(direct.find((node) => node.type === "h1").props.children, opportunity.title);
  const context = { view: "saved", q: "C++", location: "Paris", degree_level: "master", study_year: "1", page: "5" };
  const refreshed = await page(id, { ...context, returnTo: "https://example.invalid/", type: "job" });
  const back = tab(refreshed, "Back to Jobs").props.href;
  assert.match(back, /^\/jobs\?/);
  assert.deepEqual(queryOf(back), context);
  assert.deepEqual(calls, Array(2).fill(["/api/v1/opportunities/" + id, { authentication: "none" }]));
  const denied = await detailPage(async () => { throw new Error("redirect /sign-in"); });
  await assert.rejects(() => denied(), /redirect \/sign-in/);
});

test("detail distinguishes malformed, 404, and 422 from service errors and preserves retry context", async () => {
  let requests = 0;
  let failure;
  const page = await detailPage(async () => ({ api: { request: async () => {
    requests += 1;
    if (failure) throw failure;
    return { ...opportunity, is_active: true, skills: [] };
  } } }));
  const missing = (tree) => tree.some((node) => node.props.children === "Opportunity not found");
  assert.ok(missing(await page("not-a-uuid")));
  assert.equal(requests, 0);
  for (const status of [404, 422]) {
    failure = new ApiError(status, "api_error");
    assert.ok(missing(await page()));
  }
  const context = { view: "applied", q: "robotics", page: "2" };
  for (const error of [new ApiError(503, "network_error"), new ApiError(401, "api_error"), new Error("failure")]) {
    failure = error;
    const tree = await page(id, context);
    assert.equal(missing(tree), false);
    const retry = tree.find((node) => node.type === "Error").props.action;
    assert.equal(retry.props.action, "/opportunities/" + id);
    assert.deepEqual(Object.fromEntries(nodes(retry).filter((node) => node.type === "input").map(({ props }) =>
      [props.name, props.value])), context);
  }
  failure = null;
  assert.ok((await page(id, context)).some((node) => node.type === "article"));
});

test("the detail segment has accessible loading and missing-ID states", async () => {
  const { default: loading } = await load("../src/app/(workspace)/opportunities/[id]/loading.tsx", { "react/jsx-runtime": runtime });
  assert.equal(loading().props.role, "status");
  assert.equal(String(loading().props["aria-busy"]), "true");
  const { default: missing } = await load("../src/app/(workspace)/opportunities/page.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "Link" },
    "@/lib/auth/account": { requireCompletedAccount: async () => ({}) },
  });
  const tree = nodes(await missing());
  assert.ok(tree.some((node) => node.props.children === "Opportunity not found"));
  assert.equal(tab(tree, "Back to Jobs").props.href, "/jobs");
});

test("a withdrawn detail leaves existing Saved and Applied tracker records visible", async () => {
  const entry = { ...opportunity, title: "Withdrawn internship" };
  const detail = await detailPage(async () => ({ api: { request: async () => { throw new ApiError(404, "api_error"); } } }));
  for (const [view, status] of [["saved", "saved"], ["applied", "offer"]]) {
    const tracker = row(status, entry);
    const jobs = await fixture((path, init) => {
      assert.equal(path, "/api/v1/applications");
      assert.equal(init, undefined);
      return { items: [tracker] };
    });
    const initial = await jobs.visit({ view, q: "python", page: "2" });
    const context = queryOf("/?" + list(initial).detailContext);
    const missing = await detail(entry.id, context);
    assert.ok(missing.some((node) => node.props.children === "Opportunity not found"));
    const returned = await jobs.visit(queryOf(tab(missing, "Back to Jobs").props.href));
    const item = list(returned).items[0];
    assert.equal(item.opportunity.title, entry.title);
    assert.equal(item.status, status);
  }
});

test("inactive is authoritative and deadline dates do not imply expiry or a timezone cutoff", async () => {
  let job = { ...opportunity, is_active: false, deadline: "2024-01-10T00:00:00+14:00",
    description: "Source overview", skills: [{ id: "skill", name: "Python" }], degree_level: "master", study_year: [1] };
  const page = await detailPage(async () => ({ api: { request: async () => job } }));
  const tree = await page();
  assert.ok(tree.some((node) => node.props.children === "Closed on InternCalling"));
  const render = (component) => nodes(component({ opportunity: job, value: job.deadline }));
  assert.equal(render(detailUi.OpportunityDeadline).find((node) => node.type === "time").props.dateTime, "2024-01-10");
  const source = render(detailUi.OpportunitySource).find((node) => node.type === "a");
  assert.equal(source.props.children[0], "View official listing");
  assert.equal(source.props.rel, "noopener noreferrer");
  const facts = render(detailUi.OpportunityFacts);
  for (const word of ["Source overview", "Python", "Master’s", "1"]) {
    assert.ok(facts.some((node) => node.props.children === word));
  }
  job = { ...job, is_active: true };
  assert.ok(!(await page()).some((node) => node.props.children === "Closed on InternCalling"));
  assert.equal(render(detailUi.OpportunitySource)[0].props.children[0], "View original opportunity");
  job = { ...job, deadline: null };
  assert.deepEqual(render(detailUi.OpportunityDeadline), []);
  for (const url of ["javascript:alert(0)", "https://user:pass@example.invalid", "//example.invalid", null]) {
    job = { ...job, url };
    assert.deepEqual(render(detailUi.OpportunitySource), []);
  }
});
