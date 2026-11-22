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
const catalog = JSON.parse(await readFile(new URL("../../../database/seeds/skills_catalog.proposed.json", import.meta.url), "utf8"));
const helpers = await load("../src/lib/profile-skills.ts");
const adapter = await load("../src/lib/skill-discovery.ts", { "../../../../database/seeds/skills_catalog.proposed.json": { default: catalog }, "./profile-skills": helpers });
test("all nine source categories and all 140 canonical skills are reachable without fabricated IDs", () => {
  const { groups } = adapter.groupedSkills([], [], "");
  assert.deepEqual(groups.slice(0, 9).map(g => g.id), catalog.categories.map(g => g.id));
  assert.equal(groups.flatMap(g => g.choices).length, 140);
  assert.ok(groups.flatMap(g => g.choices).every(s => !s.record && !("id" in s)));
});
test("alias search is grouped and resolves only discovery to the canonical addition name", () => {
  const results = adapter.groupedSkills([], [], "js");
  assert.ok(results.groups.find(g => g.id === "programming-and-cs").choices.some(s => s.name === "javascript"));
  assert.equal(adapter.canonicalDiscoveryName(" JS "), "javascript");
  assert.equal(adapter.canonicalDiscoveryName("custom tool"), "custom tool");
});
test("selected skills are excluded, live records preserved, duplicates removed and unknown skills remain available", () => {
  const record = { id: "real-fixture-id", name: "JavaScript" };
  const { groups } = adapter.groupedSkills([record, { id: "duplicate", name: "javascript" }, { id: "other", name: "custom tool" }], [{ id: "selected", name: " PYTHON " }], "");
  const choices = groups.flatMap(g => g.choices);
  assert.equal(choices.filter(s => s.name.toLowerCase() === "javascript").length, 1);
  assert.equal(choices.find(s => s.name === "JavaScript").record, record);
  assert.equal(choices.some(s => s.name === "python"), false);
  assert.equal(groups.at(-1).choices[0].name, "custom tool");
});
globalThis.requestAnimationFrame ??= callback => { callback(); return 0; };
const jsx = (type, props) => ({ type, props: props ?? {} });
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
test("category controls expose all entries, grouped keyboard options skip headings, API failures preserve local discovery and saves require confirmation", async () => {
  const state = [], refs = []; let index = 0, refIndex = 0, saved = [], accept = false;
  const react = {
    useId: () => "group-test",
    useRef(current) { const slot = refIndex++; return refs[slot] ??= { current }; },
    useState(initial) { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], next => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }]; },
  };
  const { GroupedSkillPicker } = await load("../src/components/profile/grouped-skill-picker.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "@/lib/skill-discovery": adapter, "@/lib/profile-skills": helpers,
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const props = { catalog: [], selected: [], loading: false, error: "Offline", disabled: false, onRetry() {}, onAdd: async name => { saved.push(name); return accept; } };
  const render = () => { index = 0; refIndex = 0; return GroupedSkillPicker(props); };
  assert.equal(nodes(render()).filter(n => n.type === "h3").length, 10);
  let toggle = nodes(render()).find(n => n.type === "button" && n.props["aria-controls"]);
  toggle.props.onClick();
  toggle = nodes(render()).find(n => n.type === "button" && n.props["aria-controls"]);
  assert.equal(toggle.props["aria-expanded"], false); toggle.props.onClick();
  for (let i = 0; i < 10; i++) {
    const more = nodes(render()).filter(n => n.type === "Button" && String([n.props.children].flat().join("")).startsWith("Show more"));
    if (!more.length) break;
    for (const button of more) button.props.onClick();
  }
  assert.equal(nodes(render()).filter(n => n.type === "Button" && catalog.skills.some(s => s.name === n.props.children)).length, 140);
  assert.ok(nodes(render()).some(n => n.props.role === "alert"));
  const input = () => nodes(render()).find(n => n.type === "Input");
  input().props.onChange({ target: { value: "js" } });
  assert.ok(nodes(render()).some(n => n.props.role === "group" && n.props["aria-label"].includes("Programming")));
  globalThis.document = { getElementById: () => ({ scrollIntoView() {} }) };
  input().props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(input().props["aria-activedescendant"], "group-test-option-0");
  await nodes(render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(saved, ["javascript"]);
  assert.equal(input().props.value, "js", "Failed confirmation retains the query");
  accept = true;
  await nodes(render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(input().props.value, "");
  props.selected = [{ id: "saved", name: "javascript" }];
  input().props.onChange({ target: { value: "js" } });
  assert.ok(nodes(render()).some(n => n.type === "Button" && n.props.children === "Add skill" && n.props.disabled));
  assert.equal(nodes(render()).some(n => n.props.role === "option" && n.props.children === "javascript"), false);
});
