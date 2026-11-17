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
const jsx = (type, props) => ({ type, props: props ?? {} }), runtime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const text = value => typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" ? text(value.props?.children) : "";
const button = (tree, label) => nodes(tree).find(n => n.type === "Button" && text(n) === label);
function hooks() {
  const values = [], refs = [], effects = [];
  let index = 0, refIndex = 0;
  return {
    refs, effects,
    react: {
      useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
      useRef(current) { const slot = refIndex++; return refs[slot] ??= { current }; },
      useId: () => "drawer-test",
      useEffect: effect => effects.push(effect),
    },
    render(Component, props) { index = 0; refIndex = 0; return Component(props); },
  };
}
const helpers = await load("../src/lib/profile-skills.ts");
globalThis.requestAnimationFrame ??= callback => { callback(); return 0; };

test("Profile drawer closes during a request, then reconciles confirmed count/chips without reopening", async () => {
  const state = hooks(); let resolve;
  const response = new Promise(done => { resolve = done; });
  const { ProfileSkills } = await load("../src/components/profile/profile-skills.tsx", {
    react: state.react, "react/jsx-runtime": runtime, "@/lib/profile-skills": helpers,
    "@/app/(workspace)/profile/skills-actions": { getSkillSuggestions: async () => ({ skills: [] }), getProfileSkills: async () => ({ skills: [] }), addProfileSkill: async () => response },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/ui/error-state": { ErrorState: "ErrorState" }, "./skill-chip": { SkillChip: "Chip" }, "./grouped-skill-picker": { GroupedSkillPicker: "Picker" },
  });
  const render = () => state.render(ProfileSkills, { initialSkills: [] });
  assert.equal(find(render(), "Drawer").props.open, false);
  button(render(), "Add skills").props.onClick();
  assert.equal(find(render(), "Drawer").props.open, true);
  assert.equal(find(render(), "Drawer").props.keepMounted, true);
  const pending = find(render(), "Picker").props.onAdd("python");
  assert.match(text(render()), /0 saved skills/);
  assert.equal(button(render(), "Add skills").props.disabled, false, "Trigger remains focusable during request");
  find(render(), "Drawer").props.onClose();
  assert.equal(find(render(), "Drawer").props.open, false);
  resolve({ skills: [{ id: "actual-confirmed-id", name: "python" }], success: "Skill added." });
  assert.equal(await pending, true);
  assert.equal(find(render(), "Drawer").props.open, false);
  assert.match(text(render()), /1 saved skills/);
  assert.equal(find(render(), "Chip").props.skill.id, "actual-confirmed-id");
  assert.equal(find(render(), "Drawer").props.footer.props.children, "Done");
});

test("drawer query survives confirmation/failure, groups reveal matches and selected results disable addition", async () => {
  const catalog = JSON.parse(await readFile(new URL("../../../database/seeds/skills_catalog.proposed.json", import.meta.url), "utf8"));
  const adapter = await load("../src/lib/skill-discovery.ts", { "../../../../database/seeds/skills_catalog.proposed.json": { default: catalog }, "./profile-skills": helpers });
  const state = hooks(); let accept = false, attempts = 0;
  const { GroupedSkillPicker } = await load("../src/components/profile/grouped-skill-picker.tsx", {
    react: state.react, "react/jsx-runtime": runtime, "@/lib/skill-discovery": adapter, "@/lib/profile-skills": helpers,
    "@/components/ui/input": { Input: "Input" }, "@/components/ui/button": { Button: "Button" },
  });
  const props = { catalog: [], selected: [], loading: false, error: "", disabled: false, mode: "drawer", onAdd: async () => { attempts++; return accept; } };
  const render = () => state.render(GroupedSkillPicker, props);
  assert.ok(nodes(render()).filter(n => n.type === "button").every(n => n.props["aria-expanded"] === false));
  find(render(), "Input").props.onChange({ target: { value: "js" } });
  assert.ok(nodes(render()).filter(n => n.type === "button").every(n => n.props["aria-expanded"] === true));
  await find(render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(find(render(), "Input").props.value, "js");
  accept = true;
  await find(render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(attempts, 2); assert.equal(find(render(), "Input").props.value, "js");
  props.selected = [{ id: "confirmed", name: "javascript" }];
  const selected = nodes(render()).find(n => n.type === "Button" && n.props.role === "option" && n.props["aria-selected"]);
  assert.ok(selected); assert.equal(selected.props.disabled, true); assert.match(text(selected), /javascript.*added/);
  await find(render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(attempts, 2);
  let prevented = false;
  find(render(), "Input").props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { prevented = true; } });
  assert.equal(prevented, false, "Drawer Escape reaches the native dialog cancel");
});

test("existing modal primitive shows modal, locks scroll and restores the trigger on close", async () => {
  const state = hooks(); let focused = 0, cancelled = 0, closeFocused = 0;
  class Element {
    isConnected = true;
    getClientRects() { return [1]; }
    focus() { focused++; }
  }
  const saved = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  globalThis.HTMLElement = Element;
  globalThis.document = { activeElement: new Element(), body: { style: { overflow: "auto" } }, documentElement: {}, getElementById() {} };
  try {
    const { Drawer } = await load("../src/components/ui/drawer.tsx", { react: state.react, "react/jsx-runtime": runtime, "./button": { Button: "Button" } });
    const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector() { return { focus() { closeFocused++; } }; } };
    const tree = state.render(Drawer, { open: true, onClose() { cancelled++; }, title: "Add skills", size: "skills", keepMounted: true, children: "Catalog", footer: "Done" });
    tree.props.ref.current = dialog;
    state.effects[0](); const cleanup = state.effects[1]();
    assert.equal(dialog.open, true); assert.equal(globalThis.document.body.style.overflow, "hidden");
    assert.equal(closeFocused, 1);
    assert.ok(tree.props["aria-labelledby"]);
    assert.match(tree.props.className, /sm:max-w-\[460px\]/); assert.match(tree.props.className, /w-full/);
    tree.props.onCancel({ preventDefault() {} }); assert.equal(cancelled, 1);
    cleanup();
    assert.equal(dialog.open, false); assert.equal(globalThis.document.body.style.overflow, "auto"); assert.equal(focused, 1);
  } finally {
    globalThis.document = saved.document; globalThis.HTMLElement = saved.HTMLElement;
  }
});

test("failed immediate addition keeps the confirmed count and retry reconciles the main card", async () => {
  const state = hooks(); let result = { error: "Connection failed" };
  const { ProfileSkills } = await load("../src/components/profile/profile-skills.tsx", {
    react: state.react, "react/jsx-runtime": runtime, "@/lib/profile-skills": helpers,
    "@/app/(workspace)/profile/skills-actions": { getSkillSuggestions: async () => ({ skills: [] }), getProfileSkills: async () => ({ skills: [] }), addProfileSkill: async () => result },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
    "@/components/ui/error-state": { ErrorState: "ErrorState" }, "./skill-chip": { SkillChip: "Chip" }, "./grouped-skill-picker": { GroupedSkillPicker: "Picker" },
  });
  const render = () => state.render(ProfileSkills, { initialSkills: [] });
  button(render(), "Add skills").props.onClick();
  assert.equal(await find(render(), "Picker").props.onAdd("python"), false);
  assert.match(text(render()), /0 saved skills/);
  const feedback = find(render(), "Picker").props.feedbackContent;
  assert.ok(nodes(feedback).some(n => n.props.role === "alert"));
  result = { skills: [{ id: "confirmed", name: "python" }], success: "Skill added." };
  button(feedback, "Retry").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(text(render()), /1 saved skills/);
  find(render(), "Drawer").props.footer.props.onClick();
  assert.equal(find(render(), "Drawer").props.open, false);
});
