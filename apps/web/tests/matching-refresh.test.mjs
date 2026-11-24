import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
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
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }

test("confirmed profile/skill writes feed fresh Jobs requests and the real scorer without stale client results", { timeout: 30000 }, async () => {
  const windowsPython = new URL("../../api/.venv/Scripts/python.exe", import.meta.url);
  const python = existsSync(windowsPython) ? windowsPython : new URL("../../api/.venv/bin/python", import.meta.url);
  const child = spawn(process.env.B5_TEST_PYTHON ?? fileURLToPath(python), [fileURLToPath(new URL("./matching_backend_fixture.py", import.meta.url))], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)), stdio: ["pipe", "pipe", "pipe"],
  });
  const waiting = [];
  let stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  createInterface({ input: child.stdout }).on("line", line => {
    const pending = waiting.shift();
    if (pending) { try { pending.resolve(JSON.parse(line)); } catch (error) { pending.reject(error); } }
  });
  child.on("error", error => { for (const task of waiting.splice(0)) task.reject(error); });
  child.on("exit", code => { for (const task of waiting.splice(0)) task.reject(new Error("Fixture exited " + code + ": " + stderr.slice(-1500))); });
  const request = input => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); child.stdin.write(JSON.stringify(input) + "\n"); });
  try {
    const client = await load("../src/lib/api/client.ts");
    const calls = [];
    const api = client.createApiClient({
      baseUrl: "http://isolated-backend.invalid", getAccessToken: async () => "synthetic-transport-identity",
      transport: async (url, init) => {
        calls.push({ path: url.pathname + url.search, method: init.method, cache: init.cache });
        const response = await request({ path: url.pathname + url.search, method: init.method, ...(init.body ? { body: JSON.parse(init.body) } : {}) });
        assert.equal(response.fixture_error, undefined);
        return new Response(JSON.stringify(response.body), { status: response.status, headers: { "Content-Type": "application/json" } });
      },
    });
    await api.request("/api/v1/profile", { method: "PATCH", body: { degree_level: "bachelor", university: "Synthetic University", field_of_study: "Mathematics", graduation_year: 2027, location: "Paris" } });
    const account = async () => { const profile = await api.request("/api/v1/profile"); return { kind: "ready", profile, user: { id: profile.user_id }, api }; };
    const invalidated = [];
    const profileHelper = await load("../src/lib/profile-edit.ts");
    const skillsHelper = await load("../src/lib/profile-skills.ts");
    const types = await load("../src/lib/api/types.ts");
    const common = { "next/cache": { revalidatePath: path => invalidated.push(path) }, "@/lib/auth/account": { getAccountState: account }, "@/lib/api/client": client };
    const { saveProfile } = await load("../src/app/(workspace)/profile/actions.ts", { ...common, "@/lib/api/types": types, "@/lib/profile-edit": profileHelper });
    const skillActions = await load("../src/app/(workspace)/profile/skills-actions.ts", { ...common, "@/lib/profile-skills": skillsHelper });
    const opportunityHelpers = await load("../src/lib/opportunities.ts");
    const { default: JobsPage } = await load("../src/app/(workspace)/jobs/page.tsx", {
      "react/jsx-runtime": runtime, "next/link": "Link", "@/lib/auth/account": { requireCompletedAccount: account },
      "@/components/workspace/recommended-jobs": { RecommendedJobs: "RecommendedJobs" },
      "@/components/jobs/jobs-search": { JobsSearch: "JobsSearch" }, "@/components/ui/button": { Button: "Button" },
      "@/components/ui/empty-state": { EmptyState: "EmptyState" }, "@/components/ui/error-state": { ErrorState: "ErrorState" },
      "./save-action": { saveOpportunity() {} },
      "./assessment-action": { loadOpportunityAssessment() {} },
      "./saved-search-actions": { savedSearchAction() {} }, "@/components/jobs/saved-searches": { SavedSearches: "SavedSearches" },
      "@/lib/jobs-url": await load("../src/lib/jobs-url.ts"),
    });
    const searchParams = Promise.resolve({ q: "Python", type: "internship", page: "1" });
    const visit = async () => nodes(await JobsPage({ searchParams })).find(n => n.type === "RecommendedJobs").props.items;
    const before = await visit();
    assert.equal(before.length, 1);
    let trace = (await request({ op: "trace" })).observed;
    assert.equal(trace.at(-1).field_of_study, "Mathematics");
    assert.deepEqual(trace.at(-1).skills, []);
    const saved = await saveProfile({ field_of_study: "Computing", location: "Berlin" });
    assert.equal(saved.profile.field_of_study, "Computing");
    assert.deepEqual(invalidated.splice(0), ["/profile", "/jobs"]);
    assert.deepEqual((await skillActions.addProfileSkill(" Python ")).skills.map(s => s.name), ["python"]);
    assert.deepEqual(invalidated.splice(0), ["/profile", "/jobs"]);
    const after = await visit();
    trace = (await request({ op: "trace" })).observed;
    assert.equal(trace.length, 2, "Returning to Jobs issues another real match request");
    assert.equal(trace.at(-1).field_of_study, "Computing");
    assert.equal(trace.at(-1).location, "Berlin");
    assert.deepEqual(trace.at(-1).skills, ["python"]);
    assert.equal(after[0].match.components.skills, 13); // 1 of at least 3 counted skills: round(40 / 3)
    const listing = calls.filter(c => c.path.startsWith("/api/v1/opportunities/recommended?"));
    assert.equal(listing.length, 2);
    const query = new URL("http://fixture.invalid" + listing.at(-1).path).searchParams;
    assert.equal(query.get("search"), "Python"); assert.equal(query.get("opportunity_type"), "internship");
    assert.equal(query.get("page"), "1"); assert.equal(query.get("page_size"), "12");
    assert.ok(calls.every(c => c.cache === "no-store"));

    // Preserve client selection state while replacing props: scores/details must use new items.
    const state = [];
    let cursor = 0;
    const { RecommendedJobs } = await load("../src/components/workspace/recommended-jobs.tsx", {
      react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useEffect() {}, useRef: (current) => ({ current }), useState(initial) { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], next => { state[slot] = next; }]; } },
      "@/lib/company-logo": await load("../src/lib/company-logo.ts"), "react/jsx-runtime": runtime, "@/lib/opportunities": opportunityHelpers,
      "@/components/applications/application-controls": { ApplicationControls: "ApplicationControls" },
      "@/components/jobs/job-card": { JobCard: "JobCard" }, "@/components/jobs/match-score": { MatchScore: "MatchScore" },
      "@/components/jobs/eligibility-badge": { EligibilityBadge: "EligibilityBadge" }, "@/components/ui/badge": { Badge: "Badge" },
      "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
      "@/components/jobs/tailoring-entry-point": { TailoringEntryPoint: "TailoringEntryPoint" },
      "@/components/jobs/opportunity-details": await load("../src/components/jobs/opportunity-details.tsx", {
        "react/jsx-runtime": runtime, "@/components/ui/badge": { Badge: "Badge" },
      }),
      "next/link": { default: "Link" },
      "@/components/jobs/company-avatar": { CompanyAvatar: "CompanyAvatar" }, "@/components/ui/icon": { Icon: "Icon" },
      "@/components/jobs/opportunity-detail-view": {
        OpportunityDetailView: "OpportunityDetailView",
        opportunityDisplayDate: () => undefined,
      },
    });
    RecommendedJobs({ items: before }); cursor = 0;
    const rendered = RecommendedJobs({ items: after });
    assert.equal(nodes(rendered).find(n => n.type === "JobCard").props.job.matchScore, after[0].match.score);
    assert.equal(nodes(rendered).find(n => n.type === "OpportunityDetailView").props.opportunity, after[0].opportunity);

    const previous = after[0].match;
    await saveProfile({ headline: "New introduction", bio: "New biography" });
    const textOnly = await visit();
    const inputs = (await request({ op: "trace" })).observed.at(-1);
    assert.equal(Object.hasOwn(inputs, "headline"), false); assert.equal(Object.hasOwn(inputs, "bio"), false);
    assert.deepEqual(textOnly[0].match, previous, "Headline/bio do not alter deterministic matching");
    await skillActions.removeProfileSkill("python"); await visit();
    assert.deepEqual((await request({ op: "trace" })).observed.at(-1).skills, []);
    // Reconcile an already-persisted update (e.g. an earlier unconfirmed response/another tab).
    await api.request("/api/v1/profile", { method: "PATCH", body: { field_of_study: "Robotics" } });
    invalidated.length = 0;
    assert.equal((await saveProfile({ field_of_study: "Robotics" })).profile.field_of_study, "Robotics");
    assert.deepEqual(invalidated, ["/profile", "/jobs"], "A confirmed no-op save must also invalidate older Jobs results");
    await api.request("/api/v1/profile/skills", { method: "POST", body: { name: "python" } });
    invalidated.length = 0;
    await skillActions.addProfileSkill("python");
    assert.deepEqual(invalidated, ["/profile", "/jobs"], "Duplicate reconciliation must invalidate older Jobs results");
    await visit();
    const reconciled = (await request({ op: "trace" })).observed.at(-1);
    assert.equal(reconciled.field_of_study, "Robotics"); assert.deepEqual(reconciled.skills, ["python"]);
  } finally {
    child.stdin.end();
    if (child.exitCode === null) child.kill();
  }
});
