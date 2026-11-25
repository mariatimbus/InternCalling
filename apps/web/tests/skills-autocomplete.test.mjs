import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(file, dependencies = {}) {
  dependencies = { "@/components/ui/icon": { Icon: "Icon" }, ...dependencies };
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
const helpers = await load("../src/lib/profile-skills.ts");
const transport = await load("../src/lib/api/client.ts");
const catalog = ["c/c++", "data structures and algorithm", "java", "javascript", "object-oriented programming", "python", "typescript"]
  .map((name, i) => ({ id: "synthetic-skill-" + i, name }));
const selected = catalog.filter((skill) => skill.name !== "java");
const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx };
function hooks() {
  const values = [], effects = [];
  let index = 0;
  return {
    react: {
      useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], (next) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
      useRef: (current) => ({ current }),
      useId: () => "skills-test",
      useEffect: (effect) => effects.push(effect),
    },
    effects,
    render(Component, props) { index = 0; return Component(props); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);

async function setup({ response = catalog, reject = false, emptyAction = false } = {}) {
  const requests = [];
  let currentResponse = response;
  const api = transport.createApiClient({
    baseUrl: "http://127.0.0.1:8000",
    getAccessToken: async () => "synthetic-test-identity",
    transport: async (url, init) => {
      requests.push({ url: url.href, method: init.method });
      if (reject) throw new Error("synthetic unavailable");
      return new Response(JSON.stringify(currentResponse), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const actions = await load("../src/app/(workspace)/profile/skills-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/account": { getAccountState: async () => ({ kind: "ready", api }) },
    "@/lib/api/client": transport,
    "@/lib/profile-skills": helpers,
  });
  const state = hooks(), inputState = hooks();
  const { SkillAutocomplete } = await load("../src/components/profile/skill-autocomplete.tsx", {
    react: inputState.react, "react/jsx-runtime": runtime,
    "@/lib/profile-skills": helpers,
    "@/components/ui/input": { Input: "Input" },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
  });
  const { ProfileSkills } = await load("../src/components/profile/profile-skills.tsx", {
    react: state.react, "react/jsx-runtime": runtime,
    "@/lib/profile-skills": helpers,
    "@/app/(workspace)/profile/skills-actions": { ...actions, ...(emptyAction ? { getSkillSuggestions: async () => ({}) } : {}) },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/ui/error-state": { ErrorState: "ErrorState" },
    "./skill-chip": { SkillChip: "SkillChip" },
    "./grouped-skill-picker": { GroupedSkillPicker: SkillAutocomplete },
  });
  const render = () => {
    const tree = state.render(ProfileSkills, { initialSkills: selected });
    const props = find(tree, (node) => node.type === SkillAutocomplete).props;
    return { props, tree: inputState.render(SkillAutocomplete, props) };
  };
  const initial = render();
  state.effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  return { initial, render, requests, setResponse: (value) => { currentResponse = value; } };
}

test("exact captured state: GET /skills -> validated action -> catalog state -> visible java option", async () => {
  const fixture = await setup();
  assert.equal(fixture.initial.props.loading, true);
  let rendered = fixture.render();
  assert.equal(rendered.props.catalog.length, 7);
  assert.equal(rendered.props.error, "");
  find(rendered.tree, (n) => n.type === "Input").props.onChange({ target: { value: "java" } });
  rendered = fixture.render();
  assert.deepEqual(fixture.requests, [{ url: "http://127.0.0.1:8000/api/v1/skills", method: "GET" }]);
  assert.deepEqual(nodes(rendered.tree).filter((n) => n.props.role === "option").map((n) => n.props.children), ["java"]);
  assert.equal(find(rendered.tree, (n) => n.type === "Input").props["aria-expanded"], true);
  assert.equal(find(rendered.tree, (n) => n.type === "Button" && n.props.children === "Add skill").props.disabled, false);
});

test("request failures, malformed catalogs and missing action payloads render errors, never empty success", async () => {
  for (const options of [{ reject: true }, { response: { items: catalog } }, { emptyAction: true }]) {
    const fixture = await setup(options);
    let rendered = fixture.render();
    find(rendered.tree, (n) => n.type === "Input").props.onChange({ target: { value: "java" } });
    rendered = fixture.render();
    assert.ok(rendered.props.error);
    assert.ok(find(rendered.tree, (n) => n.props.role === "alert"));
    assert.equal(find(rendered.tree, (n) => n.props.role === "listbox"), undefined);
    assert.equal(find(rendered.tree, (n) => typeof n.props.children === "string" && n.props.children.includes("No matching suggestions")), undefined);
  }
});

test("successful empty catalog stays distinct and permits custom addition", async () => {
  const fixture = await setup({ response: [] });
  let rendered = fixture.render();
  find(rendered.tree, (n) => n.type === "Input").props.onChange({ target: { value: "java" } });
  rendered = fixture.render();
  assert.equal(rendered.props.error, "");
  assert.ok(find(rendered.tree, (n) => n.props.role === "status" && n.props.children.includes("catalog is empty")));
  assert.equal(find(rendered.tree, (n) => n.type === "Button" && n.props.children === "Add skill").props.disabled, false);
});

test("suggestion states distinguish loading, failure, empty catalog, selected matches and no matches", () => {
  assert.equal(helpers.skillSuggestionState([], [], "java", true, "").kind, "loading");
  assert.equal(helpers.skillSuggestionState([], [], "java", false, "Offline").kind, "error");
  assert.equal(helpers.skillSuggestionState([], [], "java", false, "").kind, "empty");
  assert.equal(helpers.skillSuggestionState(catalog, selected, "script", false, "").kind, "selected");
  assert.equal(helpers.skillSuggestionState(catalog, selected, "not in catalog", false, "").kind, "unmatched");
  assert.deepEqual(helpers.skillSuggestionState(catalog, selected, " JaVa ", false, "").choices.map(s => s.name), ["java"]);
});

test("Refresh suggestions replaces a stale selected-only catalog and reveals java without losing the query", async () => {
  const fixture = await setup({ response: selected });
  let rendered = fixture.render();
  find(rendered.tree, (n) => n.type === "Input").props.onChange({ target: { value: "java" } });
  rendered = fixture.render();
  assert.equal(find(rendered.tree, (n) => n.props.role === "listbox"), undefined);
  fixture.setResponse(catalog);
  const refresh = find(rendered.tree, (n) => n.type === "Button" && n.props.children === "Refresh suggestions");
  assert.ok(refresh);
  refresh.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  rendered = fixture.render();
  assert.equal(fixture.requests.length, 2);
  assert.equal(find(rendered.tree, (n) => n.type === "Input").props.value, "java");
  assert.deepEqual(nodes(rendered.tree).filter((n) => n.props.role === "option").map((n) => n.props.children), ["java"]);
});
