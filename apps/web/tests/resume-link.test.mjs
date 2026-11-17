import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

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
const urls = await load("../src/lib/resume-link.ts");
const types = await load("../src/lib/api/types.ts");
const { ApiError } = await load("../src/lib/api/client.ts");
const completion = await load("../src/lib/profile-completion.ts");
const profile = { id: "fixture-profile", user_id: "fixture-user", headline: "Keep headline", bio: null, degree_level: "master", university: "Fixture University", field_of_study: "Computing", graduation_year: 2027, location: "Bucharest", resume_url: null, created_at: "2026-11-17T00:00:00Z", updated_at: "2026-11-17T00:00:00Z" };

async function actions(options = {}) {
  let persisted = { ...profile, ...options.profile };
  const calls = [], invalidated = [];
  const { saveResumeLink } = await load("../src/app/(workspace)/profile/resume-actions.ts", {
    "next/cache": { revalidatePath: path => invalidated.push(path) },
    "@/lib/auth/account": { getAccountState: async () => options.state ?? ({
      kind: "ready", user: { id: profile.user_id }, profile: { ...persisted },
      api: { request: async (path, init) => {
        calls.push({ path, ...init });
        if (options.error) throw options.error;
        persisted = { ...persisted, ...init.body };
        return options.wrongOwner ? { ...persisted, user_id: "wrong-user" } : options.invalidResponse ? {} : { ...persisted };
      } },
    }) },
    "@/lib/api/client": { ApiError }, "@/lib/api/types": types, "@/lib/resume-link": urls,
  });
  return { saveResumeLink, calls, invalidated, persisted: () => persisted };
}

test("URL validation permits absolute HTTP(S), trims surrounding whitespace and maps removal to null", () => {
  for (const value of ["https://example.invalid/resume.pdf", "http://example.invalid/resume", " HTTPS://example.invalid/cv?download=1#page1 "]) {
    assert.equal(urls.validateResumeUrl(value).resumeUrl, value.trim());
  }
  for (const value of [null, "", " \n "]) assert.deepEqual(urls.validateResumeUrl(value), { resumeUrl: null });
  const atLimit = "https://example.invalid/" + "a".repeat(488);
  assert.equal(atLimit.length, 512);
  assert.ok(urls.safeResumeUrl(atLimit));
  assert.ok(urls.validateResumeUrl(atLimit + "a").error);
});

test("relative URLs, active schemes, embedded credentials, parser ambiguities and malformed hosts are rejected", () => {
  for (const value of [
    "/cv.pdf", "//example.invalid/cv", "javascript:alert(1)", "data:text/html,unsafe", "file:///cv",
    "ftp://example.invalid/cv", "https:example.invalid", "https://user:fake@example.invalid/cv",
    "https://@example.invalid/cv", "https://example.invalid\\@elsewhere.invalid/cv",
    "https://example.invalid/a b", "https://exam\nple.invalid/cv", "https://", "http://a:99999/cv", {}, 5,
  ]) {
    assert.ok(urls.validateResumeUrl(value).error, JSON.stringify(value));
    assert.equal(urls.safeResumeUrl(value), null);
  }
});

test("save and replacement PATCH only resume_url, return persisted values and preserve other fields/completion", async () => {
  const state = await actions();
  const before = completion.profileCompletion(state.persisted(), []);
  const result = await state.saveResumeLink(" https://example.invalid/cv ");
  assert.equal(result.resumeUrl, "https://example.invalid/cv");
  assert.deepEqual(state.calls, [{ path: "/api/v1/profile", method: "PATCH", body: { resume_url: "https://example.invalid/cv" } }]);
  assert.deepEqual(state.invalidated, ["/profile"]);
  assert.equal(state.persisted().headline, profile.headline);
  assert.deepEqual(completion.profileCompletion(state.persisted(), []), before);
  assert.equal((await state.saveResumeLink("https://example.invalid/replaced")).resumeUrl, "https://example.invalid/replaced");
  assert.equal(state.persisted().resume_url, "https://example.invalid/replaced");
});

test("removal sends explicit null; unchanged values avoid a duplicate PATCH", async () => {
  const state = await actions({ profile: { resume_url: "https://example.invalid/old" } });
  assert.equal((await state.saveResumeLink(null)).resumeUrl, null);
  assert.deepEqual(state.calls[0].body, { resume_url: null });
  await state.saveResumeLink(null);
  assert.equal(state.calls.length, 1);
});

test("invalid values and unavailable accounts never write; API failures and mismatched owners cannot succeed", async () => {
  const invalid = await actions();
  assert.ok((await invalid.saveResumeLink("javascript:alert(1)")).error);
  assert.equal(invalid.calls.length, 0);
  for (const kind of ["guest", "not-configured", "profile-error"]) {
    const state = await actions({ state: { kind } });
    assert.ok((await state.saveResumeLink("https://example.invalid/cv")).error);
    assert.equal(state.calls.length, 0);
  }
  for (const options of [{ wrongOwner: true }, { invalidResponse: true }, ...[401, 403, 422, 429, 503].map(status => ({ error: new ApiError(status, "private upstream text") }))]) {
    const state = await actions(options);
    const result = await state.saveResumeLink("https://example.invalid/cv");
    assert.ok(result.error);
    assert.equal(Object.hasOwn(result, "resumeUrl"), false);
    assert.doesNotMatch(result.error, /private upstream/);
  }
});

const jsx = (type, props) => ({ type, props: props ?? {} });
function hooks() {
  const values = [], refs = [];
  let index = 0, refIndex = 0;
  return {
    react: {
      useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
      useRef(current) { const slot = refIndex++; if (!(slot in refs)) refs[slot] = { current }; return refs[slot]; },
      useEffect() {},
    },
    render(Component, props) { index = 0; refIndex = 0; return Component(props); },
  };
}
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, predicate) => nodes(tree).find(predicate);
async function editor(initialResumeUrl, saveResumeLink) {
  const state = hooks();
  const { ResumeEditor } = await load("../src/components/profile/resume-editor.tsx", {
    react: state.react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/resume-link": urls, "@/app/(workspace)/profile/resume-actions": { saveResumeLink },
    "@/components/ui/button": { Button: "Button" }, "@/components/ui/input": { Input: "Input" }, "@/components/ui/error-state": { ErrorState: "ErrorState" },
  });
  const render = () => state.render(ResumeEditor, { initialResumeUrl });
  return { render, edit: () => find(render(), n => n.type === "Button" && ["Add resume link", "Replace link"].includes(n.props.children)).props.onClick() };
}

test("Cancel discards edits without calling the action; failed saves retain the draft and the saved link", async () => {
  let calls = 0;
  const old = "https://example.invalid/old";
  const f = await editor(old, async () => { calls++; return { error: "Try Save again" }; });
  f.edit();
  find(f.render(), n => n.type === "Input").props.onChange({ target: { value: "https://example.invalid/new" } });
  find(f.render(), n => n.type === "Button" && n.props.children === "Cancel").props.onClick();
  assert.equal(calls, 0);
  assert.equal(find(f.render(), n => n.type === "a").props.href, old);
  f.edit();
  assert.equal(find(f.render(), n => n.type === "Input").props.value, old);
  find(f.render(), n => n.type === "Input").props.onChange({ target: { value: "https://example.invalid/new" } });
  await find(f.render(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(find(f.render(), n => n.type === "Input").props.value, "https://example.invalid/new");
  assert.ok(find(f.render(), n => n.type === "ErrorState"));
  find(f.render(), n => n.type === "Button" && n.props.children === "Cancel").props.onClick();
  assert.equal(find(f.render(), n => n.type === "a").props.href, old);
});

test("pending saves disable controls and block duplicate submissions; confirmed data survives remount", async () => {
  let resolve, calls = 0;
  const response = new Promise(done => { resolve = done; });
  const f = await editor(null, async () => { calls++; return response; });
  f.edit();
  find(f.render(), n => n.type === "Input").props.onChange({ target: { value: "https://example.invalid/draft" } });
  const submit = find(f.render(), n => n.type === "form").props.onSubmit;
  const first = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(find(f.render(), n => n.type === "Input").props.disabled, true);
  assert.ok(nodes(f.render()).filter(n => n.type === "Button").every(n => n.props.disabled));
  resolve({ resumeUrl: "https://example.invalid/persisted", success: "Resume link saved." });
  await first;
  assert.equal(find(f.render(), n => n.type === "a").props.href, "https://example.invalid/persisted");
  const reloaded = await editor("https://example.invalid/persisted", async () => ({}));
  assert.equal(find(reloaded.render(), n => n.type === "a").props.href, "https://example.invalid/persisted");
});

test("removal stays reviewable until Save and results in the empty persisted state", async () => {
  let sent = "not submitted";
  const f = await editor("https://example.invalid/old", async value => { sent = value; return { resumeUrl: null }; });
  find(f.render(), n => n.type === "Button" && n.props.children === "Remove link").props.onClick();
  assert.equal(find(f.render(), n => n.type === "Input").props.value, "");
  await find(f.render(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(sent, null);
  assert.equal(find(f.render(), n => n.type === "a"), undefined);
  assert.match(JSON.stringify(f.render()), /No resume link added/);
});

test("real React SSR renders safe external links and never turns invalid legacy values into anchors", async () => {
  const { ResumeEditor } = await load("../src/components/profile/resume-editor.tsx", {
    react: React, "react/jsx-runtime": jsxRuntime, "@/lib/resume-link": urls,
    "@/app/(workspace)/profile/resume-actions": { saveResumeLink: async () => ({}) },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" }, "@/components/ui/error-state": { ErrorState: "div" },
  });
  const render = value => renderToStaticMarkup(React.createElement(ResumeEditor, { initialResumeUrl: value }));
  const safe = render("https://example.invalid/cv");
  assert.match(safe, /target="_blank"/); assert.match(safe, /rel="noopener noreferrer"/);
  assert.match(safe, /Resume link added/); assert.match(safe, /Not available yet/);
  assert.doesNotMatch(safe, /type="file"/);
  for (const value of ["javascript:alert(1)", "https://fixture:fake@example.invalid/cv", "/relative", "x".repeat(513)]) {
    const html = render(value);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /Replace link/); assert.match(html, /Remove link/);
    assert.doesNotMatch(html, /fixture:fake/);
  }
  assert.match(render(null), /No resume link added/);
});
