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

const key = (item) => item.id;
const page = (items, current = 2, total = 6) => ({ items: items.map((id) => ({ id })), page: current, page_size: 2, total });
const initial = [{ id: "a" }, { id: "b" }];
async function mount(loadPage, start = initial) {
  const slots = [], cleanups = [];
  let cursor = 0, effectMounted = false, disposed = false;
  const react = {
    useState(value) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof value === "function" ? value() : value;
      return [slots[slot], (next) => {
        assert.equal(disposed, false, "an unmounted feed must ignore late responses");
        slots[slot] = typeof next === "function" ? next(slots[slot]) : next;
      }];
    },
    useRef(value) { const slot = cursor++; return slots[slot] ??= { current: value }; },
    useCallback: (callback) => callback,
    useEffect(effect) { if (!effectMounted) cleanups.push(effect()); },
  };
  const bindings = await load("../src/components/jobs/infinite-scroll.tsx", {
    react, "react/jsx-runtime": { jsx() {}, jsxs() {} }, "@/components/ui/button": { Button() {} },
  });
  function render(items = start) {
    cursor = 0;
    const value = bindings.useInfiniteList(items, { page: 1, pageSize: 2, total: 6 }, loadPage, key);
    effectMounted = true;
    return value;
  }
  const first = render();
  return { first, render, unmount() { cleanups.forEach((cleanup) => cleanup?.()); disposed = true; } };
}

test("appends in backend order, deduplicates IDs, and stops on an empty page", async () => {
  const calls = [];
  const feed = await mount(async (next) => {
    calls.push(next);
    return next === 2 ? page(["b", "d", "c"]) : page([], 3);
  });
  await feed.first.loadNext();
  assert.deepEqual(feed.render().items.map(key), ["a", "b", "d", "c"]);
  assert.equal(feed.render().hasMore, true);
  await feed.render().loadNext();
  assert.equal(feed.render().hasMore, false);
  await feed.render().loadNext();
  assert.deepEqual(calls, [2, 3]);
});

test("repeated observer notifications cannot start concurrent loads", async () => {
  const pending = Promise.withResolvers();
  let requests = 0;
  const feed = await mount(() => { requests++; return pending.promise; });
  const first = feed.first.loadNext();
  const second = feed.first.loadNext();
  assert.equal(requests, 1);
  assert.equal(feed.render().loading, true);
  pending.resolve(page(["c", "d"], 2, 4));
  await Promise.all([first, second]);
  assert.equal(feed.render().loading, false);
  assert.equal(feed.render().hasMore, false);
  assert.deepEqual(feed.render().items.map(key), ["a", "b", "c", "d"]);
});

test("failure retains loaded results and retry requests the same page", async () => {
  const calls = [];
  const feed = await mount(async (next) => {
    calls.push(next);
    if (calls.length === 1) throw new Error("offline");
    return page(["c", "d"]);
  });
  await feed.first.loadNext();
  assert.equal(feed.render().error, true);
  assert.deepEqual(feed.render().items.map(key), ["a", "b"]);
  await feed.render().loadNext();
  assert.equal(feed.render().error, false);
  assert.deepEqual(calls, [2, 2]);
});

test("a retired search ignores its late response and a new search starts fresh", async () => {
  const pending = Promise.withResolvers();
  const previous = await mount(() => pending.promise);
  const loading = previous.first.loadNext();
  previous.unmount();
  const current = await mount(async () => page(["y"], 2, 3), [{ id: "x" }]);
  pending.resolve(page(["old"]));
  await loading;
  assert.deepEqual(current.render().items.map(key), ["x"]);
  await current.first.loadNext();
  assert.deepEqual(current.render().items.map(key), ["x", "y"]);
});

test("continues through duplicate-only pages after catalog inserts and rejects malformed pagination", async () => {
  const duplicates = await mount(async (next) => next === 2 ? page(["a", "b"]) : page(["c", "d"], 3));
  await duplicates.first.loadNext();
  assert.equal(duplicates.render().hasMore, true);
  assert.deepEqual(duplicates.render().items.map(key), ["a", "b"]);
  await duplicates.render().loadNext();
  assert.deepEqual(duplicates.render().items.map(key), ["a", "b", "c", "d"]);
  assert.equal(duplicates.render().hasMore, false);
  const malformed = await mount(async () => page(["c"], 9));
  await malformed.first.loadNext();
  assert.equal(malformed.render().error, true);
  assert.deepEqual(malformed.render().items.map(key), ["a", "b"]);
});

test("public continuation normalizes filters and refuses invalid pages before API access", async () => {
  const calls = [];
  const { loadExplorePage } = await load("../src/app/(public)/explore/load-more-action.ts", {
    "@/lib/api/catalog": { getPublicCatalog: async (query) => { calls.push(query); return page(["c"]); } },
    "@/lib/opportunities": { opportunityTypes: ["internship", "scholarship"] },
  });
  await loadExplorePage({ search: "python", type: "scholarship" }, 2);
  assert.deepEqual(calls, [{ search: "python", type: "scholarship", page: 2 }]);
  for (const invalid of [0, -1, 1.5, 10001, "2", null]) {
    await assert.rejects(() => loadExplorePage({}, invalid));
  }
  assert.equal(calls.length, 1);
});

test("recommendation continuation verifies identity and retains the same filters and internship scope", async () => {
  const calls = [];
  let verified = 0;
  const { loadMoreRecommended } = await load("../src/app/(workspace)/jobs/load-more-action.ts", {
    "@/lib/auth/account": { requireCompletedAccount: async () => {
      verified++;
      return { api: { request: async (path) => { calls.push(path); return page(["c"]); } } };
    } },
    "@/lib/api/types": {},
    "@/lib/jobs-url": await load("../src/lib/jobs-url.ts"),
  });
  await loadMoreRecommended({ q: " Python ", location: " Berlin ", degree_level: "master", study_year: "1", type: "job", page: "8" }, "internship", 2);
  assert.equal(verified, 1);
  assert.deepEqual(Object.fromEntries(new URL(calls[0], "http://fixture.test").searchParams), {
    search: "Python", location: "Berlin", degree_level: "master", study_year: "1", page: "2", page_size: "12", opportunity_type: "internship", is_active: "true",
  });
  await loadMoreRecommended({ q: "insight" }, "early_career", 3);
  assert.equal(new URL(calls[1], "http://fixture.test").searchParams.get("opportunity_type"), "early_career");
  await assert.rejects(loadMoreRecommended({}, "job", 2), /Invalid kind/);
});
