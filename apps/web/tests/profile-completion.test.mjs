import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
globalThis.requestAnimationFrame ??= (callback) => { callback(); return 0; };
const helper = await load("../src/lib/profile-completion.ts");
const editing = await load("../src/lib/profile-edit.ts");
const skillsHelper = await load("../src/lib/profile-skills.ts");
const empty = { id: "synthetic-profile", user_id: "synthetic-user", headline: null, bio: null, degree_level: null, university: null, field_of_study: null, graduation_year: null, location: null, resume_url: null, created_at: "2026-11-17T00:00:00Z", updated_at: "2026-11-17T00:00:00Z" };
const full = { ...empty, headline: "Engineer", bio: "Projects and research", degree_level: "master", university: "Fixture University", field_of_study: "Computing", graduation_year: 2027, location: "Bucharest" };
const savedSkills = [{ id: "synthetic-skill", name: "python" }];
const calculate = helper.profileCompletion;

test("empty, partial and full known persisted snapshots have eight equally weighted items", () => {
  assert.equal(calculate(empty, []).percentage, 0);
  assert.equal(calculate({ ...empty, headline: "Saved" }, []).percentage, 13);
  assert.equal(calculate({ ...empty, headline: "Saved", bio: "Saved", location: "Saved" }, []).percentage, 38);
  assert.equal(calculate(full, []).percentage, 88);
  assert.equal(calculate(full, savedSkills).percentage, 100);
  assert.equal(calculate(full, savedSkills).completed, 8);
});

test("whitespace, invalid fields and unsaved resume metadata do not count", () => {
  const invalid = { ...empty, headline: " ", bio: "\n\t", university: "x".repeat(256), degree_level: "phd", graduation_year: 2027.5, location: " ", resume_url: "https://example.invalid/resume" };
  assert.equal(calculate(invalid, [{ id: "known", name: " " }]).completed, 0);
  for (const year of [0, 1899, 2101, "2027", NaN]) assert.equal(calculate({ ...empty, graduation_year: year }, []).completed, 0);
  assert.equal(calculate({ ...empty, headline: " Saved " }, []).completed, 1);
});

test("saved skills count once regardless of quantity; unknown data is never zero", () => {
  assert.equal(calculate(empty, savedSkills).percentage, 13);
  assert.equal(calculate(empty, [...savedSkills, { id: "two", name: "java" }]).completed, 1);
  assert.equal(calculate(null, savedSkills), null);
  assert.equal(calculate(full, null), null);
  assert.equal(calculate(full, [{ id: 7, name: "python" }]), null);
});

const jsx = (type, props) => ({ type, props: props ?? {} });
const runtime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function hooks() {
  const values = [], refs = [];
  let index = 0, refIndex = 0;
  return {
    react: {
      useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], (next) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
      useRef(current) { const slot = refIndex++; if (!(slot in refs)) refs[slot] = { current }; return refs[slot]; },
      useEffect() {},
      useMemo(factory) { return factory(); },
      useCallback(callback) { return callback; },
      useImperativeHandle(ref, create) { if (ref) ref.current = create(); },
    },
    render(Component, props) { index = 0; refIndex = 0; return Component(props); },
  };
}
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, predicate) => nodes(tree).find(predicate);

async function fixture({ profile = empty, skills = [], save = {}, mutate = {}, refreshed = {}, insightsEnabled = false, contactEmail } = {}) {
  const hubHooks = hooks(), editorHooks = hooks(), skillsHooks = hooks();
  const { ProfileEditor } = await load("../src/components/profile/profile-editor.tsx", {
    react: editorHooks.react, "react/jsx-runtime": runtime, "@/lib/profile-edit": editing,
    "@/app/(workspace)/profile/actions": { saveProfile: async (fields) => typeof save === "function" ? save(fields) : save },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" }, "@/components/ui/input": { Input: "Input" },
    "@/components/ui/select": { Select: "Select" }, "@/components/ui/field": { Field: "Field", fieldControl: "" },
    "@/components/ui/error-state": { ErrorState: "ErrorState" },
  });
  const { ProfileSkills } = await load("../src/components/profile/profile-skills.tsx", {
    react: skillsHooks.react, "react/jsx-runtime": runtime, "@/lib/profile-skills": skillsHelper,
    "@/app/(workspace)/profile/skills-actions": {
      addProfileSkill: async () => mutate, removeProfileSkill: async () => mutate,
      getProfileSkills: async () => mutate, getSkillSuggestions: async () => ({ skills: [] }),
    },
    "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" }, "@/components/ui/error-state": { ErrorState: "ErrorState" },
    "./skill-chip": { SkillChip: "SkillChip" }, "./grouped-skill-picker": { GroupedSkillPicker: "Autocomplete" },
  });
  const { ProfileHub } = await load("../src/components/profile/profile-hub.tsx", {
    react: hubHooks.react, "react/jsx-runtime": runtime,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/profile-services": { createProfileServices: () => Object.fromEntries(["experience", "projects", "certificates", "honours", "languages", "publications", "pdf", "review"].map(name => [name, { name }])) },
    "./resume-review-flow": { ResumeReviewFlow: "ReviewFlow" },
    "@/app/(workspace)/profile/completion-actions": { refreshCompletion: async () => refreshed },
    "@/lib/profile-completion": helper, "@/components/ui/button": { Button: "Button" },
    "./profile-completion": { ProfileCompletion: "Completion" },
    "./profile-editor": { ProfileEditor }, "./profile-skills": { ProfileSkills }, "./profile-social-links": { ProfileSocialLinks: "SocialLinks" }, "./resume-editor": { ResumeEditor: "ResumeEditor" }, "./resume-pdf-section": { ResumePdfSection: "ResumePdfSection" }, "./experience-section": { ExperienceSection: "ExperienceSection" }, "./projects-section": { ProjectsSection: "ProjectsSection" }, "./certificates-section": { CertificatesSection: "CertificatesSection" }, "./honours-section": { HonoursSection: "HonoursSection" }, "./languages-section": { LanguagesSection: "LanguagesSection" }, "./publications-section": { PublicationsSection: "PublicationsSection" }, "./profile-collection-sections": { ProfileCollectionSections: "CollectionSections" },
  });
  const hub = () => hubHooks.render(ProfileHub, { initialProfile: profile, initialSkills: skills, insightsEnabled, contactEmail });
  const editor = () => editorHooks.render(ProfileEditor, find(hub(), n => n.type === ProfileEditor).props);
  const skillsView = () => skillsHooks.render(ProfileSkills, find(hub(), n => n.type === ProfileSkills).props);
  const completion = () => { const props = find(hub(), n => n.type === "Completion").props; return calculate(props.profile, props.skills); };
  return { hub, editor, skillsView, completion };
}

test("typing and Cancel leave completion unchanged; only a confirmed profile save updates it", async () => {
  const f = await fixture({ save: { profile: { ...empty, headline: "Persisted" } } });
  find(f.editor(), n => n.type === "Button" && n.props.children === "Edit profile").props.onClick();
  find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.onChange({ target: { value: "Unsaved" } });
  assert.equal(f.completion().percentage, 0);
  find(f.editor(), n => n.type === "Button" && n.props.children === "Cancel").props.onClick();
  assert.equal(f.completion().percentage, 0);
  find(f.editor(), n => n.type === "Button" && n.props.children === "Edit profile").props.onClick();
  assert.equal(find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.value, "");
  find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.onChange({ target: { value: "Unsaved" } });
  await find(f.editor(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(f.completion().percentage, 13);
});

test("the document profile separates education and opens the existing editor without losing saved details", async () => {
  const f = await fixture({ profile: full, skills: savedSkills, contactEmail: "student@example.invalid" });
  const saved = f.editor();
  assert.ok(find(saved, n => n.props.id === "profile-education"));
  assert.ok(find(saved, n => n.props.children === "Fixture University"));
  assert.ok(find(saved, n => n.props.children === "student@example.invalid"));
  find(saved, n => n.type === "Button" && n.props.children === "Edit education").props.onClick();
  const university = find(f.editor(), n => n.type === "Input" && n.props.name === "university");
  assert.equal(university.props.value, "Fixture University");
  university.props.onChange({ target: { value: "Unsaved university" } });
  find(f.editor(), n => n.type === "Button" && n.props.children === "Cancel").props.onClick();
  assert.ok(find(f.editor(), n => n.props.children === "Fixture University"));
  assert.equal(f.completion().percentage, 100);
});

test("failed profile saves preserve entered values and cannot increase completion", async () => {
  const f = await fixture({ save: { error: "Try again" } });
  find(f.editor(), n => n.type === "Button" && n.props.children === "Edit profile").props.onClick();
  find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.onChange({ target: { value: "Retry this draft" } });
  await find(f.editor(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(f.completion(), null);
  assert.equal(find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.value, "Retry this draft");
});

test("confirmed add and remove update completion; failed confirmation makes it unavailable", async () => {
  const add = await fixture({ mutate: { skills: savedSkills } });
  assert.equal(await find(add.skillsView(), n => n.type === "Autocomplete").props.onAdd("python"), true);
  assert.equal(add.completion().percentage, 13);
  const remove = await fixture({ skills: savedSkills, mutate: { skills: [] } });
  find(remove.skillsView(), n => n.type === "SkillChip").props.onRemove();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(remove.completion().percentage, 0);
  const failed = await fixture({ mutate: { error: "Could not confirm" } });
  assert.equal(await find(failed.skillsView(), n => n.type === "Autocomplete").props.onAdd("python"), false);
  assert.equal(failed.completion(), null);
});

test("unknown data hides the percentage; confirmed retry restores it without resetting editor draft", async () => {
  const f = await fixture({ skills: null, refreshed: { profile: full, skills: savedSkills } });
  assert.equal(f.completion(), null);
  find(f.editor(), n => n.type === "Button" && n.props.children === "Edit profile").props.onClick();
  find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.onChange({ target: { value: "Keep draft" } });
  find(f.hub(), n => n.type === "Completion").props.onRetry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.completion().percentage, 100);
  assert.equal(find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.value, "Keep draft");
});

test("compact completion has labelled progress and no checklist, formula or matching copy", async () => {
  const { ProfileCompletion } = await load("../src/components/profile/profile-completion.tsx", {
    "react/jsx-runtime": runtime, "@/lib/profile-completion": helper, "@/components/ui/drawer": { Drawer: "Drawer" }, "@/components/ui/button": { Button: "Button" },
  });
  const tree = ProfileCompletion({ profile: full, skills: savedSkills, pending: false, onRetry() {} });
  const progress = find(tree, n => n.type === "progress");
  assert.equal(progress.props.value, 100); assert.equal(progress.props.max, 100);
  assert.equal(progress.props["aria-label"], "Profile completion");
  assert.equal(nodes(tree).filter(n => n.type === "li").length, 0);
  assert.equal(find(tree, n => n.type === "summary"), undefined);
  assert.match(JSON.stringify(tree), /100%/);
  assert.doesNotMatch(JSON.stringify(tree), /match score|eligibility|divided by|checklist/);
  const unknown = ProfileCompletion({ profile: full, skills: null, pending: false, onRetry() {} });
  assert.equal(find(unknown, n => n.type === "progress"), undefined);
  assert.ok(find(unknown, n => n.props.role === "alert"));
});

test("refresh action returns only authenticated persisted data; unavailable and malformed data stay unknown", async () => {
  for (const kind of ["ready", "guest", "profile-error"]) {
    const { refreshCompletion } = await load("../src/app/(workspace)/profile/completion-actions.ts", {
      "@/lib/auth/account": { getAccountState: async () => ({ kind, profile: full, api: { request: async () => savedSkills } }) },
      "@/lib/profile-skills": skillsHelper,
    });
    const result = await refreshCompletion();
    if (kind === "ready") assert.deepEqual(result, { profile: full, skills: savedSkills });
    else assert.equal(result.profile, undefined);
  }
  const { refreshCompletion } = await load("../src/app/(workspace)/profile/completion-actions.ts", {
    "@/lib/auth/account": { getAccountState: async () => ({ kind: "ready", profile: full, api: { request: async () => ({ error: "upstream" }) } }) },
    "@/lib/profile-skills": skillsHelper,
  });
  const result = await refreshCompletion();
  assert.equal(result.skills, undefined); assert.ok(result.error);
});

test("rounding covers every possible eighth without including resume_url", () => {
  const expected = [0, 13, 25, 38, 50, 63, 75, 88, 100];
  for (let count = 0; count <= 8; count++) {
    const profile = { ...empty, resume_url: "https://example.invalid/ignored" };
    for (const item of helper.completionItems.slice(0, Math.min(count, 7))) profile[item.key] = full[item.key];
    assert.equal(calculate(profile, count === 8 ? savedSkills : []).percentage, expected[count]);
  }
});

test("failed retries stay unavailable and an older retry cannot overwrite a newer confirmed mutation", async () => {
  const failed = await fixture({ skills: null, refreshed: { error: "Offline" } });
  find(failed.hub(), n => n.type === "Completion").props.onRetry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.completion(), null);
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const race = await fixture({ skills: null, refreshed: response, mutate: { skills: savedSkills } });
  find(race.hub(), n => n.type === "Completion").props.onRetry();
  // Simulate a confirmed skill update while the independent completion refresh is pending.
  find(race.hub(), n => typeof n.type === "function" && n.type.name === "ProfileSkills").props.onConfirmed(savedSkills);
  resolve({ profile: empty, skills: [] });
  await new Promise(done => setImmediate(done));
  assert.equal(race.completion().percentage, 13);
});

test("six reusable collection cards report unconnected data without fake entries or controls", async () => {
  const sections = await load("../src/components/profile/profile-collection-sections.tsx", { "react/jsx-runtime": runtime });
  assert.deepEqual(sections.profileCollectionSections.map(s => s.title), ["Experience", "Projects", "Certificates", "Honours & Awards", "Languages", "Publications"]);
  assert.equal(new Set(sections.profileCollectionSections.map(s => s.id)).size, 6);
  const grid = sections.ProfileCollectionSections();
  assert.match(grid.props.className, /sm:grid-cols-2/);
  for (const section of sections.profileCollectionSections) {
    const card = sections.UnconnectedProfileSection({ section });
    assert.equal(card.props["aria-labelledby"], "profile-section-" + section.id);
    assert.match(JSON.stringify(card), /This section is not connected yet/);
    assert.doesNotMatch(JSON.stringify(card), /No entries/);
    assert.equal(nodes(card).filter(n => ["button", "form", "input", "a"].includes(n.type)).length, 0);
  }
});

test("Profile keeps its editors and collections without PDF upload or parsing", async () => {
  const f = await fixture();
  const tree = f.hub();
  assert.ok(find(tree, n => typeof n.type === "function" && n.type.name === "ProfileEditor"));
  assert.ok(find(tree, n => typeof n.type === "function" && n.type.name === "ProfileSkills"));
  assert.equal(find(tree, n => n.type === "ResumePdfSection"), undefined);
  assert.equal(find(tree, n => n.type === "ReviewFlow"), undefined);
  assert.equal(find(tree, n => n.props.href === "#profile-resume"), undefined);
  assert.equal(find(tree, n => n.type === "ResumeEditor"), undefined);
  assert.equal(nodes(tree).filter(n => n.type === "Completion").length, 1);
  assert.ok(find(tree, n => n.type === "CertificatesSection"));
  assert.ok(find(tree, n => n.type === "HonoursSection"));
  assert.ok(find(tree, n => n.type === "LanguagesSection"));
  assert.ok(find(tree, n => n.type === "PublicationsSection"));
  assert.equal(f.completion().total, 8);
});

test("Profile Insights is opt-in and only suggests confirmed incomplete fields and an empty skills list", async () => {
  const visible = (tree, label) => !!find(tree, n => n.props?.children === label);
  assert.equal(visible((await fixture()).hub(), "Profile Insights"), false);
  const incomplete = (await fixture({ profile: { ...full, headline: null }, insightsEnabled: true })).hub();
  assert.equal(visible(incomplete, "Profile Insights"), true);
  assert.equal(visible(incomplete, "Add headline"), true);
  assert.equal(visible(incomplete, "Add skills"), true);
  assert.equal(visible(incomplete, "Add location"), false);
  const unknown = (await fixture({ profile: full, skills: null, insightsEnabled: true })).hub();
  assert.equal(visible(unknown, "Add skills"), false);
  const complete = (await fixture({ profile: full, skills: savedSkills, insightsEnabled: true })).hub();
  assert.equal(visible(complete, "Profile Insights"), false);
});


test("editing after a confirmed refresh compares against the refreshed profile", async () => {
  const writes = [];
  const f = await fixture({ skills: null, refreshed: { profile: full, skills: savedSkills },
    save: async (fields) => { writes.push(fields); return { profile: { ...full, headline: null } }; },
  });
  f.editor();
  find(f.hub(), n => n.type === "Completion").props.onRetry();
  await new Promise(resolve => setImmediate(resolve));
  find(f.editor(), n => n.type === "Button" && n.props.children === "Edit profile").props.onClick();
  find(f.editor(), n => n.type === "Input" && n.props.name === "headline").props.onChange({ target: { value: "" } });
  await find(f.editor(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(writes, [{ headline: null }]);
});
