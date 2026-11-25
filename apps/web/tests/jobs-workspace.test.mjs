import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
const employers = JSON.parse(await readFile(new URL("../../api/src/opportunity_api/ingestion/sources/employers.json", import.meta.url), "utf8"));

async function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (name.endsWith("/employers.json")) return { default: employers };
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
const assessmentApi = await load("../src/lib/api/opportunity-assessment.ts");
const copilotModel = await load("../src/lib/opportunity-copilot.ts", { "./match-reasons": await load("../src/lib/match-reasons.ts") });
const featureFlags = await load("../src/lib/feature-flags.ts");
const profileSkillsApi = await load("../src/lib/profile-skills.ts");
const detailView = await load("../src/components/jobs/opportunity-detail-view.tsx", {
  "react/jsx-runtime": runtime, "next/link": { default: "Link" },
  "@/components/jobs/match-requirements": { RequirementList: "RequirementList", MatchChips: "MatchChips" },
  "@/lib/job-description": await load("../src/lib/job-description.ts"),
  "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" },
  "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" },
  "@/components/jobs/match-score": { MatchScore: "MatchScore" },
  "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
  "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
  "@/components/ui/badge": { Badge: "Badge" }, "@/components/ui/icon": { Icon: "Icon" },
  "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "@/lib/organization-logo": { organizationLogo: () => null }, "@/lib/match-reasons": await load("../src/lib/match-reasons.ts"), "@/lib/opportunities": { opportunityTypeLabel: (type) => type },
  "@/lib/profile-skills": profileSkillsApi,
  "@/lib/opportunity-copilot": copilotModel,
  "@/components/jobs/opportunity-details": detailUi,
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
  const continuation = await load(jobs + "load-more-action.ts", {
    "@/lib/auth/account": account, "@/lib/jobs-url": jobsUrl,
  });
  const { default: page } = await load(jobs + "page.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "Link" }, "@/lib/auth/account": account,
    "@/components/workspace/recommended-feed": { RecommendedFeed: "JobsList" },
    "@/components/jobs/jobs-search": { JobsSearch: "JobsSearch" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/empty-state": { EmptyState: "Empty" }, "@/components/ui/error-state": { ErrorState: "Error" },
    "./save-action": action,
    "./load-more-action": continuation,
    "./saved-search-actions": { savedSearchAction() {} }, "@/components/jobs/saved-searches": { SavedSearches: "SavedSearches" },
    "./assessment-action": { loadOpportunityAssessment() {}, loadOpportunityCatalog() {} },
    "@/lib/feature-flags": featureFlags,
    "@/lib/profile-skills": profileSkillsApi,
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
  assert.ok(!tab(recommended, "Next page"));
  assert.ok(!tab(recommended, "Previous page"));
  assert.deepEqual(list(recommended).pagination, { page: 2, pageSize: 12, total: 36 });
  await list(recommended).loadMore(3);
  assert.deepEqual(queryOf(app.calls.filter(([path]) => path.includes("opportunities/recommended?")).at(-1)[0]), {
    opportunity_type: "internship", is_active: "true", page: "3", page_size: "12", search: "C++ & Python", ...filters,
  });
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
  let states = {};
  const lock = { current: new Set() };
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: {
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useState: (initial) => initial && typeof initial === "object"
        ? [states, (update) => { states = update(states); }]
        : [initial, () => {}],
      useRef: () => lock,
      useEffect: () => {},
    },
    "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "@/lib/organization-logo": { organizationLogo: () => null }, "@/lib/match-reasons": await load("../src/lib/match-reasons.ts"), "react/jsx-runtime": runtime, "@/lib/opportunities": { opportunitySummary: () => ({}) },
    "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/jobs/match-score": { MatchScore: "MatchScore" },
    "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
    "@/components/jobs/opportunity-details": detailUi, "next/link": { default: "Link" },
    "@/components/jobs/opportunity-detail-view": detailView,
    "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" }, "@/components/ui/icon": { Icon: "Icon" },
  });
  let complete;
  let attempts = 0;
  let applications = [];
  const saveAction = () => {
    attempts += 1;
    return new Promise((resolve) => { complete = resolve; });
  };
  const render = (detail = false) => {
    const tree = nodes(RecommendedJobs({ items: [{ opportunity, match: null, status: applications[0]?.status }], applications, saveAction }));
    const control = detail
      ? tree.find((node) => node.type === detailView.OpportunityDetailView).props.saveControl
      : tree.find((node) => node.type === "JobCard").props.action;
    return nodes(control.type(control.props));
  };
  assert.equal(render(true).find((node) => node.type === "Button").props.size, "md");
  assert.equal(render(true).find((node) => node.type === "Icon").props.name, "bookmark");
  const firstClick = render().find((node) => node.type === "Button").props.onClick;
  transition = firstClick();
  await render(true).find((node) => node.type === "Button").props.onClick();
  assert.equal(attempts, 1);
  assert.equal(render().find((node) => node.type === "Button").props.disabled, true);
  assert.equal(render(true).find((node) => node.type === "Button").props.disabled, true);
  assert.ok(!render().some((node) => node.type === "Badge"));
  complete({ error: "Try again." });
  await transition;
  assert.equal(render().find((node) => node.props.role === "alert").props.children, "Try again.");
  transition = render(true).find((node) => node.type === "Button").props.onClick();
  complete({ status: "offer" });
  await transition;
  assert.equal(render().find((node) => node.type === "Badge").props.children, "offer");
  assert.ok(!render().some((node) => node.type === "Button"));
  applications = [row("interview")];
  assert.equal(render(true).find((node) => node.type === "Badge").props.children, "interview");
  applications = [];
  assert.ok(render(true).some((node) => node.type === "Button"));
});

test("Recommended preserves API ranking even when a later card has a higher score", async () => {
  const other = { ...opportunity, id: "00000000-0000-4000-8000-000000000002" };
  const ranked = [
    { opportunity, match: { score: 20 }, eligibility: { status: "eligible", reasons: [] } },
    { opportunity: other, match: { score: 49 }, eligibility: { status: "unknown", reasons: [] } },
  ];
  const app = await fixture((path) => path === "/api/v1/applications"
    ? { items: [row("applied", other)] }
    : { items: ranked, total: 30, page_size: 12 });
  const page = await app.visit({ q: "engineer", page: "2" });
  assert.deepEqual(list(page).items.map((item) => item.opportunity.id), [opportunity.id, other.id]);
  assert.equal(list(page).items[1].status, "applied");
  assert.equal(list(page).applications[0].opportunity_id, other.id);
  assert.equal(typeof list(page).loadAssessment, "function");
  assert.equal(app.calls.filter(([path]) => path.includes("/recommended?")).length, 1);
  assert.ok(app.calls.every(([path]) => !path.endsWith("/match")));
});

test("cards omit unknown metadata and keep official links, selection and Save independent", async () => {
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useState: (value) => [value, () => {}], useEffect: () => {}, useRef: (current) => ({ current }) },
    "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "@/lib/organization-logo": { organizationLogo: () => null }, "@/lib/match-reasons": await load("../src/lib/match-reasons.ts"), "react/jsx-runtime": runtime, "@/lib/opportunities": {
      opportunitySummary: (job) => ({ title: job.title, company: "Fixture" }), opportunityTypeLabel: (type) => type,
    },
    "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/jobs/match-score": { MatchScore: "MatchScore" },
    "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
    "@/components/jobs/opportunity-details": detailUi, "next/link": { default: "Link" },
    "@/components/jobs/opportunity-detail-view": detailView,
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
  const trackedTree = nodes(RecommendedJobs({ items: [{ ...listings[2], companyLogoUrl: logoFixture }], detailContext: context,
    children: jsx("h1", { children: "Search this catalog" }) }));
  assert.ok(trackedTree.findIndex(node => node.type === "h1") >= 0);
  assert.ok(trackedTree.findIndex(node => node.type === "h1") < trackedTree.findIndex(node => node.type === "JobCard"));
  assert.equal(trackedTree.find((node) => node.type === "JobCard").props.job.companyLogoUrl, logoFixture);
  const briefs = trackedTree.filter((node) => node.type === detailView.OpportunityDetailView);
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
  assert.equal(tracked.action.props.status, "offer");
  assert.equal(typeof known.action.props.onSave, "function");

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
  assert.equal(supplied.props.width, 48);
  assert.match(supplied.props.className, /object-contain/);
  assert.match(frame.props.className, /\bsize-12\b/);
  supplied.props.onError();
  const failed = mount({ companyName: "Example", initials: "EX", logoUrl: first, size: "sm" });
  assert.equal(failed.props.children, "EX");
  assert.match(failed.props.className, /\bsize-12\b/);
  assert.equal(mount({ companyName: "Example", initials: "EX", logoUrl: second, size: "sm" }).props.children.props.src, second);
  assert.equal(mount({ companyName: "Example Two", initials: "EX", logoUrl: first, size: "sm" }).props.children.props.src, first);
  supplied.props.onError();
  assert.equal(mount({ companyName: "Example", initials: "EX", logoUrl: second }).props.children.props.width, 64);
  for (const logoUrl of [undefined, "//example.invalid/logo.png", "https://example.invalid/company-logos/ex.png",
    "/company-logos/../logo.png", "/company-logos/ex.png?redirect=1", "data:image/png;base64,eA=="]) {
    const fallback = mount({ logoUrl });
    assert.equal(fallback.props.children, "–");
    assert.match(fallback.props.className, /\bsize-16\b/);
  }
});

test("compact cards retain long metadata, meaningful eligibility and top-row actions", async () => {
  const { OpportunityCardContent, opportunityCardClasses } = await load("../src/components/jobs/opportunity-card-content.tsx", {
    "./match-requirements": { MatchChips: "MatchChips" },
    "react/jsx-runtime": runtime, "@/components/ui/badge": { Badge: "Badge" }, "@/components/ui/icon": { Icon: "Icon" },
    "./company-mark": { CompanyMark: "CompanyMark" }, "./company-avatar": { CompanyAvatar: "CompanyAvatar" },
    "./eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "./match-score": { MatchScore: "MatchScore" },
    "@/lib/job-description": await load("../src/lib/job-description.ts"),
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
  assert.match(opportunityCardClasses(true, "compact"), /border-primary/);
  assert.match(opportunityCardClasses(false, "compact"), /border-line/);
  assert.doesNotMatch(opportunityCardClasses(false, "compact"), /\b(?:h-full|min-h-)\b/);
  const sparse = nodes(OpportunityCardContent({ job: { ...job, eligibility: "unknown", matchScore: null, description: undefined }, density: "compact" }));
  assert.equal(sparse.find((node) => node.type === "MatchScore").props.score, null);
  assert.ok(!sparse.some((node) => node.type === "EligibilityBadge"));
  const comfortable = nodes(OpportunityCardContent({ job }));
  assert.deepEqual(comfortable.find((node) => node.type === "CompanyAvatar")?.props,
    { companyName: job.company, initials: "QU", logoUrl: job.companyLogoUrl });
});

async function detailPage(requireCompletedAccount) {
  const { default: render } = await load("../src/app/(workspace)/opportunities/[id]/page.tsx", {
    "react/jsx-runtime": runtime, "next/link": { default: "Link" }, "@/lib/auth/account": { requireCompletedAccount },
    "@/components/jobs/opportunity-detail-view": detailView, "@/components/ui/button": { Button: "Button" },
    "@/components/workspace/recommended-jobs": { StandaloneOpportunitySave: "StandaloneOpportunitySave" },
    "@/app/(workspace)/jobs/save-action": { saveOpportunity() {} },
    "@/lib/api/opportunity-assessment": assessmentApi,
    "@/lib/feature-flags": featureFlags,
    "@/lib/profile-skills": profileSkillsApi,
    "@/components/ui/error-state": { ErrorState: "Error" }, "@/lib/api/client": { ApiError }, "@/lib/jobs-url": jobsUrl,
  });
  return async (routeId = id, query = {}) => nodes(await render({
    params: Promise.resolve({ id: routeId }), searchParams: Promise.resolve(query),
  })).flatMap((node) => node.type === detailView.OpportunityDetailView ? [node, ...nodes(node.type(node.props))] : [node]);
}

test("direct detail reads the public record and authenticated assessments after the account guard", async () => {
  const calls = [];
  const page = await detailPage(async () => ({
    api: { request: async (...args) => {
      calls.push(args);
      if (args[0] === "/api/v1/applications") return { items: [] };
      if (args[0].endsWith("/match")) return { score: 0, eligibility: "not_eligible" };
      if (args[0].endsWith("/eligibility")) return { status: "unknown", reasons: [] };
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
  const endpoint = "/api/v1/opportunities/" + id;
  assert.deepEqual(calls, Array.from({ length: 2 }, () =>
    [[endpoint, { authentication: "none" }], [endpoint + "/match"], [endpoint + "/eligibility"], ["/api/v1/applications"]]).flat());
  assert.equal(typeof direct.find((node) => node.type === "StandaloneOpportunitySave").props.saveAction, "function");
  assert.ok(direct.some((node) => node.props.children === "0/100"));
  assert.ok(direct.some((node) => node.props.children === "Eligibility unknown."));
  const denied = await detailPage(async () => { throw new Error("redirect /sign-in"); });
  await assert.rejects(() => denied(), /redirect \/sign-in/);
});

test("the footer is the only official link with Copilot on or off, including full details from Saved", async () => {
  const listingGap = { rule: "degree_level", status: "unknown", reason: "Opportunity does not specify a degree level" };
  const assessment = { match: null, eligibility: { status: "unknown", reasons: [listingGap] } };
  const official = (tree) => tree.filter((node) => node.type === "a" && node.props.href === opportunity.url);
  for (const copilotEnabled of [false, true]) {
    for (const is_active of [false, true]) {
      const tree = nodes(detailView.OpportunityDetailView({
        opportunity: { ...opportunity, is_active, skills: [] }, assessment, copilotEnabled,
      }));
      const footer = tree.find((node) => node.type === "footer");
      assert.equal(official(tree).length, 1);
      assert.equal(official(nodes(footer))[0].props.children[0], is_active ? "Apply on official site" : "View official listing");
    }
  }
  const saved = row("saved");
  const summary = nodes(detailView.OpportunityDetailView({ opportunity: saved.opportunity, assessment, detailContext: "view=saved" }));
  assert.equal(official(summary).length, 0);
  const fullDetails = tab(summary, "View full details");
  const fullUrl = new URL(fullDetails.props.href, "https://fixture.invalid");
  const page = await detailPage(async () => ({ api: { request: async (path) => {
    if (path === "/api/v1/applications") return { items: [saved] };
    if (path.endsWith("/match")) return assessment.match;
    if (path.endsWith("/eligibility")) return assessment.eligibility;
    assert.equal(path, "/api/v1" + fullUrl.pathname);
    return { ...opportunity, is_active: true, skills: [] };
  } } }));
  const full = await page(fullUrl.pathname.split("/").at(-1), Object.fromEntries(fullUrl.searchParams));
  assert.equal(official(full).length, 1);
  assert.equal(official(full)[0].props.children[0], "Apply on official site");
  assert.equal(queryOf(tab(full, "Back to Jobs").props.href).view, "saved");
});

test("detail Save appears in the header while the official link stays in the footer", () => {
  const tree = nodes(detailView.OpportunityDetailView({ opportunity, assessment: null, saveControl: jsx("SaveMarker", {}) }));
  assert.ok(nodes(tree.find((node) => node.type === "header")).some((node) => node.type === "SaveMarker"));
  assert.ok(!nodes(tree.find((node) => node.type === "footer")).some((node) => node.type === "SaveMarker"));
});

test("the detail overview preserves a zero match and distinguishes unavailable from loading", () => {
  const overview = (assessment) => {
    const tree = nodes(detailView.OpportunityDetailView({ opportunity: { ...opportunity, skills: [] }, assessment, standalone: true }));
    return nodes(tree.find((node) => node.props["aria-label"] === "Match overview"));
  };
  const zero = overview({ match: { score: 0, reasons: [] }, eligibility: null });
  assert.equal(zero.find((node) => node.props.className?.includes("text-4xl")).props.children[0], 0);
  const missing = overview({ match: null, eligibility: null });
  assert.ok(missing.some((node) => node.props.children === "Match score unavailable"));
  assert.ok(!missing.some((node) => node.props.className?.includes("text-4xl")));
  assert.ok(overview(null).some((node) => node.props.children === "Loading match score…"));
});

test("a failed request leaves the other Copilot evaluation available", async () => {
  const match = { score: 0, eligibility: "not_eligible" };
  const eligibility = { status: "unknown", reasons: [] };
  for (const failed of ["match", "eligibility"]) {
    const result = await assessmentApi.readOpportunityAssessment({ request: async (path) => {
      const suffix = path.split("/").at(-1);
      if (suffix === failed) throw new ApiError(503, "network_error");
      return suffix === "match" ? match : eligibility;
    } }, id);
    const tree = nodes(detailView.OpportunityDetailView({
      opportunity: { ...opportunity, skills: [] }, assessment: result, copilotEnabled: true,
    }));
    if (failed === "match") {
      assert.ok(tree.some((node) => node.props.children === "Match score could not be loaded."));
      assert.ok(tree.some((node) => node.props.children === "Eligibility unknown."));
      assert.ok(!tree.some((node) => node.props.children === "No positive match reasons were provided for this opportunity."));
    } else {
      assert.ok(tree.some((node) => node.props.children === "0/100"));
      assert.ok(tree.some((node) => node.props.children === "Eligibility could not be loaded."));
      assert.ok(tree.some((node) => node.props.children === "No positive match reasons were provided for this opportunity."));
      assert.ok(!tree.some((node) => node.props.children === "Eligibility unknown."));
    }
    assert.ok(!tree.some((node) => node.props.children === "Suggested next action"));
  }
});

test("a late catalog response never replaces the selected Saved or Applied listing", async () => {
  const states = [], effects = [];
  let stateIndex, effectIndex;
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: {
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useRef: (current) => ({ current }),
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = value; }];
      },
      useEffect(run, deps) {
        const index = effectIndex++;
        const old = effects[index];
        if (!old || deps.some((value, i) => value !== old.deps[i])) {
          old?.cleanup?.();
          effects[index] = { deps, cleanup: run() };
        }
      },
    },
    "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "@/lib/organization-logo": { organizationLogo: () => null }, "@/lib/match-reasons": await load("../src/lib/match-reasons.ts"),
    "react/jsx-runtime": runtime, "@/lib/opportunities": { opportunitySummary: (job) => ({ id: job.id }) },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" },
    "@/components/jobs/opportunity-details": detailUi, "@/components/jobs/opportunity-detail-view": detailView,
  });
  const second = { ...opportunity, id: "00000000-0000-4000-8000-000000000002", url: "https://example.invalid/second" };
  const third = { ...opportunity, id: "00000000-0000-4000-8000-000000000003" };
  const fourth = { ...opportunity, id: "00000000-0000-4000-8000-000000000004" };
  const items = [opportunity, second, third, fourth].map((job) =>
    ({ opportunity: row("saved", job).opportunity, status: "saved", match: null }));
  const requests = new Map();
  const loadCatalog = (jobId) => new Promise((resolve, reject) => requests.set(jobId, { resolve, reject }));
  const loadAssessment = async () => ({ match: null, eligibility: null });
  function render() {
    stateIndex = effectIndex = 0;
    return nodes(RecommendedJobs({ items, loadAssessment, loadCatalog, copilotEnabled: false }));
  }
  const select = (tree, jobId) => tree.find((node) => node.type === "JobCard" && node.props.job.id === jobId).props.onSelect();
  function details(tree) {
    const views = tree.filter((node) => node.type === detailView.OpportunityDetailView);
    assert.equal(views.length, 2);
    return views.map(({ type, props }) => nodes(type(props)));
  }
  const first = render();
  assert.deepEqual([...requests.keys()], [id]);
  select(first, second.id);
  const pending = render();
  assert.deepEqual([...requests.keys()], [id, second.id]);
  requests.get(second.id).resolve({ ...second, is_active: true, skills: [] });
  await Promise.resolve();
  requests.get(id).resolve({ ...opportunity, is_active: true, skills: [] });
  await Promise.resolve();
  for (const tree of details(render())) {
    assert.deepEqual(tree.filter((node) => node.type === "a").map((node) => node.props.href), [second.url]);
  }
  select(pending, third.id);
  const missing = render();
  requests.get(third.id).resolve({ ...third, url: null, is_active: true, skills: [] });
  await Promise.resolve();
  for (const tree of details(render())) {
    assert.ok(tree.some((node) => node.props.children === "No official link is available for this opportunity."));
  }
  select(missing, fourth.id);
  render();
  requests.get(fourth.id).reject(new Error("catalog unavailable"));
  await Promise.resolve();
  for (const tree of details(render())) {
    assert.ok(tab(tree, "View full details"));
    assert.ok(tree.some((node) => node.props.children === "The official listing could not be loaded. Open full details to try again."));
  }
});

test("the flag gates profile skills reads across Recommended, Saved and Applied", async (t) => {
  const env = { ...process.env };
  delete env.OPPORTUNITY_COPILOT_ENABLED;
  t.mock.property(process, "env", env);
  const savedSkills = [{ id: "python", name: "Python" }];
  const jobsFixture = await fixture((path) => {
    if (path === "/api/v1/profile/skills") return savedSkills;
    if (path === "/api/v1/applications") return { items: [row("saved"), row("applied", { ...opportunity, id: "applied-fixture" })], total: 2 };
    return { items: [{ opportunity, match: null }], total: 1, page_size: 12 };
  });
  const calls = [];
  const page = await detailPage(async () => ({ api: { request: async (path) => {
    calls.push(path);
    if (path.endsWith("/match")) return { score: 42, reasons: ["Matches 1 of 3 skills: Python"] };
    if (path.endsWith("/eligibility")) return { status: "possibly_eligible", reasons: [] };
    if (path === "/api/v1/profile/skills") return savedSkills;
    if (path === "/api/v1/applications") return { items: [] };
    return { ...opportunity, is_active: true, skills: savedSkills };
  } } }));
  for (const enabled of [false, true]) {
    if (enabled) env.OPPORTUNITY_COPILOT_ENABLED = "true";
    for (const view of ["saved", "applied"]) {
      const trackerList = list(await jobsFixture.visit({ view }));
      assert.equal(trackerList.copilotEnabled, enabled);
      assert.deepEqual(trackerList.profileSkills, enabled ? savedSkills : null);
    }
    const jobsList = list(await jobsFixture.visit());
    assert.equal(jobsList.copilotEnabled, enabled);
    assert.deepEqual(jobsList.profileSkills, enabled ? savedSkills : null);
    const tree = await page();
    assert.equal(tree.some((node) => node.props["aria-label"] === "Opportunity Copilot"), enabled);
    assert.equal(tree.some((node) => node.props["aria-label"] === "Skills matched"), enabled);
    const explanation = nodes(tree.find((node) => node.props["aria-label"] === "Your fit for this opportunity"));
    for (const label of ["Why this fits", "What to check", "Matches 1 of 3 skills: Python", "Possibly eligible"]) {
      assert.equal(explanation.filter((node) => node.props.children === label).length, 1);
    }
  }
  const endpoint = "/api/v1/opportunities/" + id;
  assert.deepEqual(calls, [endpoint, endpoint + "/match", endpoint + "/eligibility", "/api/v1/applications",
    endpoint, endpoint + "/match", endpoint + "/eligibility", "/api/v1/applications", "/api/v1/profile/skills"]);
  assert.equal(jobsFixture.calls.filter(([path]) => path === "/api/v1/profile/skills").length, 3);
});

test("Copilot suggests one grounded action and preserves the B6 verdict and checks", () => {
  const profileGap = { rule: "study_year", status: "unknown", reason: "Student study year is not known" };
  const listingGap = { rule: "degree_level", status: "unknown", reason: "Opportunity does not specify a degree level" };
  const mismatch = { rule: "location", status: "not_eligible", reason: "A confirmed mismatch for this fixture" };
  const unclear = { ...listingGap, reason: "Unknown reason from the evaluator" };
  const render = (reasons, options = {}) => nodes(detailView.OpportunityDetailView({
    opportunity: { ...opportunity, skills: [], ...options.listing },
    assessment: { match: { score: 99 }, eligibility: { status: "not_eligible", reasons } },
    copilotEnabled: options.enabled ?? true,
  }));
  const action = (tree) => tree.find((node) => Array.isArray(node.props.children)
    && node.props.children[0]?.props?.children === "Suggested next action");
  const profile = render([listingGap, profileGap, mismatch]);
  assert.equal(action(profile).props.children[1].props.href, "/profile");
  assert.ok(profile.some((node) => node.props.children === "Not eligible"));
  assert.ok(profile.some((node) => node.props.children === "Confirmed mismatch"));
  assert.ok(profile.some((node) => node.props.children === "Eligibility details"));
  const listingOnly = render([listingGap]);
  assert.equal(action(listingOnly), undefined);
  assert.equal(listingOnly.filter((node) => node.type === "a" && node.props.href === opportunity.url).length, 1);
  const closed = render([listingGap], { listing: { is_active: false } });
  assert.equal(closed.filter((node) => node.type === "a" && node.props.href === opportunity.url).length, 1);
  assert.match(closed.find((node) => node.type === "a" && node.props.href === opportunity.url).props.children[0], /View official listing/);
  assert.equal(action(render([listingGap], { listing: { url: "javascript:alert(1)" } })), undefined);
  assert.equal(action(render([unclear, mismatch])), undefined);
  const b6 = render([listingGap], { enabled: false });
  assert.equal(action(b6), undefined);
  assert.ok(b6.some((node) => node.props.children === "Check the official listing."));
});

test("Copilot compares structured skill IDs and distinguishes empty lists from unavailable data", async () => {
  const listed = [{ id: "one", name: "Python" }, { id: "two", name: "Rust" }];
  const assessment = { match: { score: 42, reasons: ["Matches 1 of 3 skills: Java"] }, eligibility: null };
  const render = (profileSkills, job = { ...opportunity, skills: listed }) =>
    nodes(detailView.OpportunityDetailView({ opportunity: job, assessment, profileSkills, copilotEnabled: true }));
  const badges = (tree, label) => nodes(tree.find((node) => node.props["aria-label"] === label))
    .filter((node) => node.type === "Badge").map((node) => node.props.children);
  const mixed = render([{ id: "one", name: "Renamed Python" }, { id: "other", name: "Rust" }]);
  assert.deepEqual(badges(mixed, "Skills matched"), ["Python"]);
  assert.deepEqual(badges(mixed, "Potential gaps"), ["Rust"]);
  assert.ok(mixed.some((node) => node.props.children === "Listed in this opportunity, not added to your profile"));
  const empty = await profileSkillsApi.readProfileSkills({ request: async () => [] });
  assert.deepEqual(badges(render(empty), "Potential gaps"), ["Python", "Rust"]);
  assert.ok(render(empty).some((node) => node.props.children === "No listed skills match those in your profile."));
  assert.ok(render(empty, { ...opportunity, skills: [] }).some((node) => node.props.children === "No additional listed skills to check."));

  const missing = await profileSkillsApi.readProfileSkills({ request: async () => { throw new Error("API offline"); } });
  assert.equal(missing, null);
  const unavailable = render(missing);
  assert.ok(unavailable.some((node) => node.props.children === "Profile skills could not be loaded."));
  assert.ok(unavailable.some((node) => node.props.children === "42/100"));
  const summary = render(empty, row("saved").opportunity);
  assert.ok(summary.some((node) => node.props.children === "View full details"));
  for (const tree of [unavailable, summary, render(empty, opportunity)]) {
    assert.ok(!tree.some((node) => node.props.children === "Potential gaps"));
  }
});

test("standalone detail preserves tracker status and withholds Save when tracker state is unavailable", async () => {
  let trackerAvailable = true;
  const page = await detailPage(async () => ({ api: { request: async (path) => {
    if (path === "/api/v1/applications") {
      if (!trackerAvailable) throw new ApiError(503, "network_error");
      return { items: [row("applied")] };
    }
    if (path.endsWith("/match") || path.endsWith("/eligibility")) return null;
    return { ...opportunity, skills: [], is_active: true };
  } } }));
  const tracked = await page();
  const save = tracked.find((node) => node.type === "StandaloneOpportunitySave");
  assert.equal(save.props.status, "applied");
  assert.equal(save.props.saveAction, undefined);
  assert.equal(tracked.find((node) => node.type === "a").props.onClick, undefined);

  trackerAvailable = false;
  const unavailable = await page();
  assert.ok(!unavailable.some((node) => node.type === "StandaloneOpportunitySave"));
  assert.ok(unavailable.some((node) => node.props.children === "Save unavailable. Reload to try again."));
  assert.ok(unavailable.some((node) => node.type === "a"));
});

test("Match Score uses the final backend value and separates fit, gaps, points and the discount note", () => {
  const positive = ["Matches 2 of 4 skills: python, sql", "Software role fits your background", "Remote-friendly"];
  const gap = "Also asks for: docker, kafka";
  const cap = "Some requirements are not stated in the posting";
  const aiUnavailable = "AI similarity unavailable; deterministic components only";
  const render = (match) => nodes(detailView.OpportunityDetailView({
    opportunity: { ...opportunity, skills: [] },
    assessment: { match, eligibility: { status: "not_eligible", reasons: [] } },
  }));
  const capped = render({
    score: 60, components: { skills: 30, field_fit: 25, interests: 20, location: 0, ai: 0 },
    reasons: [...positive, gap, cap, aiUnavailable, "Not eligible: A gate failed"],
  });
  const text = (tree, value) => tree.some((node) => node.props.children === value);
  assert.ok(text(capped, "60/100"));
  assert.ok(text(capped, "Not eligible"));
  assert.ok(text(capped, "To stand out"));
  assert.ok(capped.some((node) => node.type === "p" && [node.props.children].flat().join("") === cap + ", so the score is slightly lower."));
  assert.ok(capped.some((node) => node.type === "summary" && node.props.children === "Score breakdown"));
  assert.deepEqual(capped.filter((node) => node.type === "li").map((node) => node.props.children), [...positive, gap]);
  assert.deepEqual(capped.filter((node) => node.type === "dd").map((node) => node.props.children),
    ["30 points", "25 points", "0 points"]); // interests no longer count toward the score
  assert.ok(!text(capped, "AI similarity"));

  // Current API: the requirement checks replace the reason lists and the breakdown.
  const requirements = [
    { key: "skills", label: "Skills", status: "partial", summary: "2 of 4 skills", matched: ["python", "sql"], missing: ["docker", "kafka"], weight: 35, earned: 17.5 },
    { key: "languages", label: "Languages", status: "missing", summary: "0 of 1 languages", matched: [], missing: ["German C1"], weight: 15, earned: 0 },
  ];
  const checked = render({ score: 35, components: { skills: 18, languages: 0, ai: 0 }, reasons: [gap], requirements });
  const list = checked.find((node) => node.type === "RequirementList");
  assert.deepEqual(list.props.requirements, requirements);
  assert.ok(text(checked, "35/100"));
  assert.ok(!text(checked, "Why this fits") && !text(checked, "Score breakdown"));
  assert.ok(checked.some((node) => node.type === "Link" && node.props.href === "/profile#profile-skills-title"));

  const sparse = render({ score: 0 });
  assert.ok(text(sparse, "0/100"));
  assert.ok(text(sparse, "No positive match reasons were provided for this opportunity."));
  assert.ok(text(sparse, "No component values were provided."));
  assert.ok(!text(sparse, "To stand out"));

  const evaluated = render({ score: 12, components: { skills: 12, ai: 0 },
    reasons: ["AI similarity: 0.00 (embeddings)"] });
  assert.ok(text(evaluated, "AI similarity"));
  assert.deepEqual(evaluated.filter((node) => node.type === "dd").map((node) => node.props.children),
    ["12 points", "0 points"]);
  assert.ok(text(evaluated, "No positive match reasons were provided for this opportunity."));
});

test("eligibility explains reported rules and keeps confirmed mismatches distinct from unverified criteria", () => {
  const reasons = [
    { rule: "degree_level", status: "not_eligible", reason: "Opportunity requires master students; student is bachelor" },
    { rule: "study_year", status: "unknown", reason: "Opportunity does not specify accepted study years" },
    { rule: "location", status: "unknown", reason: "Opportunity does not specify a location" },
    { rule: "graduation_year", status: "unknown", reason: "Student graduation year is not known" },
    { rule: "unclassified_rule", status: "possibly_eligible", reason: "This criterion still needs confirmation" },
    { rule: "another_rule", status: "eligible", reason: "Requirement met" },
  ];
  const render = (eligibility) => nodes(detailView.OpportunityDetailView({
    opportunity: { ...opportunity, skills: [] }, assessment: { match: { score: 80 }, eligibility },
  }));
  const has = (tree, text) => tree.some((node) => node.props.children === text);
  const outcome = render({ status: "not_eligible", reasons });
  assert.ok(has(outcome, "80/100"));
  assert.ok(has(outcome, "Not eligible"));
  assert.ok(has(outcome, "What to check"));
  assert.ok(has(outcome, "Confirmed mismatch"));
  assert.ok(has(outcome, "Unverified"));
  assert.ok(has(outcome, "Needs confirmation"));
  assert.ok(has(outcome, "Meets requirement"));
  assert.ok(reasons.every(({ reason }) => has(outcome, reason)));
  assert.deepEqual(outcome.filter((node) => node.type === "strong").map((node) => node.props.children),
    ["degree level", "study year, location", "graduation year", "unclassified rule"]);
  assert.deepEqual(outcome.filter((node) => node.type === "span" && node.props.className === "block").map((node) => node.props.children),
    [reasons[0].reason, "Check the official listing.", "Add your expected graduation year to your profile."]);
  assert.ok(outcome.findIndex((node) => node.props.children === "What to check")
    < outcome.findIndex((node) => node.type === "summary" && node.props.children === "Eligibility details"));

  const possible = render({ status: "possibly_eligible", reasons: [reasons.find(({ rule }) => rule === "unclassified_rule")] });
  assert.ok(has(possible, "Possibly eligible"));
  assert.ok(!has(possible, "Not eligible"));
  const unknown = render({ status: "unknown" });
  assert.ok(has(unknown, "Eligibility unknown."));
  assert.ok(has(unknown, "No per-rule eligibility details are available."));
  const unavailable = render(null);
  assert.ok(has(unavailable, "Eligibility could not be loaded."));
  assert.ok(!has(unavailable, "Eligibility unknown."));
  assert.ok(!has(unavailable, "What to check"));
});

test("switching cards scopes both Copilot surfaces and ignores the earlier in-flight assessment", async () => {
  const state = [];
  let cursor = 0;
  let cleanup;
  let effectDeps;
  let nextEffect;
  const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
    react: {
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
      useRef: (current) => ({ current }),
      useState(initial) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (value) => { state[slot] = value; }];
      },
      useEffect(effect, deps) {
        if (deps.some((value, index) => value !== effectDeps?.[index])) {
          effectDeps = deps;
          nextEffect = effect;
        }
      },
    },
    "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "@/lib/organization-logo": { organizationLogo: () => null }, "@/lib/match-reasons": await load("../src/lib/match-reasons.ts"), "react/jsx-runtime": runtime, "@/lib/opportunities": { opportunitySummary: (job) => ({ id: job.id }) },
    "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
    "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/ui/badge": { Badge: "Badge" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" }, "@/components/ui/icon": { Icon: "Icon" },
    "@/components/jobs/opportunity-details": detailUi, "@/components/jobs/opportunity-detail-view": detailView,
  });
  const second = { ...opportunity, id: "00000000-0000-4000-8000-000000000002", title: "Second role" };
  const detailContext = "view=recommended&q=python&location=Berlin&page=2";
  const requests = new Map();
  const loadAssessment = (jobId) => new Promise((resolve) => requests.set(jobId, resolve));
  const items = [opportunity, second].map((job, index) => ({
    opportunity: { ...job, skills: [{ id: String(index), name: index ? "Second skill" : "First skill" }] }, match: null,
  }));
  const profileSkills = [];
  const applications = [{ ...row("interview", second), notes: "Existing notes", updated_at: "2026-11-20" }];
  function render() {
    cursor = 0;
    const tree = nodes(RecommendedJobs({ items, applications, detailContext, loadAssessment, copilotEnabled: true, profileSkills }));
    if (nextEffect) {
      cleanup?.();
      cleanup = nextEffect();
      nextEffect = undefined;
    }
    return tree;
  }
  const first = render();
  first.find((node) => node.type === "JobCard" && node.props.job.id === second.id).props.onSelect();
  const pending = render().filter((node) => node.type === detailView.OpportunityDetailView);
  assert.equal(pending.length, 2);
  assert.ok(pending.every(({ props }) => props.tracking.application === applications[0]));
  assert.ok(pending.every(({ props }) => props.opportunity.id === second.id && props.assessment === null && props.detailContext === detailContext));
  assert.ok(pending.every(({ props }) => props.copilotEnabled));
  for (const { props } of pending) {
    const rendered = nodes(detailView.OpportunityDetailView(props));
    const controls = rendered.find((node) => node.type === "ApplicationControls");
    assert.equal(controls.props.opportunityId, second.id);
    assert.equal(controls.props.inline, true);
    const gaps = nodes(rendered.find((node) => node.props["aria-label"] === "Potential gaps"));
    assert.deepEqual(gaps.filter((node) => node.type === "Badge").map((node) => node.props.children), ["Second skill"]);
    assert.equal(props.profileSkills, profileSkills);
  }
  const active = { match: { score: 0 }, eligibility: { status: "unknown" } };
  requests.get(second.id)(active);
  await Promise.resolve();
  requests.get(id)({ match: { score: 87 }, eligibility: { status: "eligible" } });
  await Promise.resolve();
  const current = render().filter((node) => node.type === detailView.OpportunityDetailView);
  assert.equal(current.length, 2);
  assert.equal(requests.size, 2);
  for (const { props } of current) {
    assert.equal(props.opportunity.id, second.id);
    assert.equal(props.assessment, active);
    const content = nodes(detailView.OpportunityDetailView(props));
    assert.ok(content.some((node) => node.props.children === "0/100"));
    assert.ok(!content.some((node) => node.props.children === "87/100"));
  }
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
  assert.equal(tree.find((node) => node.type === "time").props.dateTime, "2024-01-10");
  const source = tree.find((node) => node.type === "a");
  assert.equal(source.props.children[0], "View official listing");
  assert.equal(source.props.rel, "noopener noreferrer");
  assert.equal(source.props.onClick, undefined);
  assert.ok(!tree.some((node) => node.type === "StandaloneOpportunitySave"));
  for (const word of ["Source overview", "Python", "Master’s", "1"]) {
    assert.ok(tree.some((node) => node.props.children === word));
  }
  job = { ...job, is_active: true };
  const active = await page();
  assert.ok(!active.some((node) => node.props.children === "Closed on InternCalling"));
  assert.equal(active.find((node) => node.type === "a").props.children[0], "Apply on official site");
  job = { ...job, deadline: null };
  assert.ok(!(await page()).some((node) => node.type === "time"));
  for (const url of ["javascript:alert(0)", "https://user:pass@example.invalid", "//example.invalid", null]) {
    job = { ...job, url };
    assert.ok(!(await page()).some((node) => node.type === "a"));
  }
});
