import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, exports);
  return exports;
}
const helpers = await load("../src/lib/profile-edit.ts");
const types = await load("../src/lib/api/types.ts");
const { ApiError } = await load("../src/lib/api/client.ts");
const profile = { id: "synthetic-profile", user_id: "synthetic-user", headline: "Student", bio: "Original bio", resume_url: null, linkedin_url: "https://www.linkedin.com/in/student", github_url: "https://github.com/student", degree_level: "bachelor", university: "Test University", field_of_study: "Computing", graduation_year: 2027, location: "Test City", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" };

async function action(options = {}) {
  const writes = [], revalidated = [];
  const api = await load("../src/app/(workspace)/profile/actions.ts", {
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "@/lib/auth/account": { getAccountState: async () => options.state ?? ({ kind: "ready", user: { id: profile.user_id }, profile: options.current ?? profile, api: { request: async (path, init) => {
      writes.push({ path, ...init });
      if (options.error) throw options.error;
      return options.response ?? { ...profile, ...init.body, updated_at: "2026-11-16T00:00:00Z" };
    } } }) },
    "@/lib/api/client": { ApiError },
    "@/lib/api/types": types,
    "@/lib/profile-edit": helpers,
  });
  return { save: api.saveProfile, writes, revalidated };
}

test("unchanged form sends nothing; changing one field never includes untouched profile/skills/resume", () => {
  const draft = helpers.profileDraft(profile);
  assert.deepEqual(helpers.changedProfileFields(profile, draft), {});
  assert.deepEqual(helpers.changedProfileFields(profile, { ...draft, headline: "  Updated headline  " }), { headline: "Updated headline" });
  assert.deepEqual(helpers.changedProfileFields({ ...profile, headline: "Student " }, { ...draft, headline: "Student " }), {});
});

test("clearing each nullable editable field deliberately emits null", () => {
  for (const field of helpers.editableProfileFields) {
    const patch = helpers.changedProfileFields(profile, { ...helpers.profileDraft(profile), [field]: "" });
    assert.deepEqual(patch, { [field]: null });
    assert.deepEqual(helpers.validateProfilePatch(patch).patch, patch);
  }
});

test("backend field limits, degree enum and year range are validated without inventing a bio limit", () => {
  for (const field of ["headline", "university", "field_of_study", "location"]) assert.ok(helpers.validateProfilePatch({ [field]: "x".repeat(256) }).fields[field]);
  for (const year of [1899, 2101, 2027.5, "2027", NaN]) assert.ok(helpers.validateProfilePatch({ graduation_year: year }).fields.graduation_year);
  assert.ok(helpers.validateProfilePatch({ degree_level: "phd" }).fields.degree_level);
  assert.equal(helpers.validateProfilePatch({ bio: "x".repeat(10000) }).error, undefined);
  assert.ok(helpers.validateProfileDraft({ ...helpers.profileDraft(profile), graduation_year: "2e3" }).graduation_year);
});

test("social links accept only secure profile URLs for their own service", () => {
  for (const [field, url] of [["linkedin_url", "https://www.linkedin.com/in/bianca"], ["github_url", "https://github.com/bianca"]]) {
    assert.deepEqual(helpers.validateProfilePatch({ [field]: url }).patch, { [field]: url });
    for (const invalid of ["https://example.com/bianca", "http://" + new URL(url).host + "/bianca", "https://" + new URL(url).host]) assert.ok(helpers.validateProfilePatch({ [field]: invalid }).fields[field]);
    assert.deepEqual(helpers.changedProfileFields(profile, { ...helpers.profileDraft(profile), [field]: url }), { [field]: url });
  }
});

test("uneditable properties and malformed payloads are rejected", () => {
  for (const patch of [null, [], "invalid", { user_id: "other" }, { resume_url: "https://example.test/cv" }, { skills: [] }]) assert.ok(helpers.validateProfilePatch(patch).error);
  assert.ok(helpers.validateProfilePatch({ headline: 123 }).fields.headline);
});

test("partial save uses PATCH only, returns persisted response and revalidates profile/jobs", async () => {
  const saved = { ...profile, headline: "Backend canonical headline", updated_at: "2026-11-16T00:00:00Z" };
  const state = await action({ response: saved });
  const result = await state.save({ headline: "New headline" });
  assert.deepEqual(state.writes, [{ path: "/api/v1/profile", method: "PATCH", body: { headline: "New headline" } }]);
  assert.deepEqual(result.profile, saved);
  assert.deepEqual(state.revalidated, ["/profile", "/jobs"]);
});

test("a concurrent unrelated change is not overwritten and already-persisted values need no write", async () => {
  const state = await action({ current: { ...profile, university: "Updated elsewhere" } });
  await state.save(helpers.changedProfileFields(profile, { ...helpers.profileDraft(profile), headline: "Edited here" }));
  assert.deepEqual(state.writes[0].body, { headline: "Edited here" });
  const noop = await action();
  assert.equal((await noop.save({ headline: profile.headline })).success, "No changes to save.");
  assert.equal(noop.writes.length, 0);
});

test("nullable clearing remains explicit in the API request", async () => {
  const state = await action();
  assert.equal((await state.save({ bio: null, graduation_year: null })).profile.bio, null);
  assert.deepEqual(state.writes[0].body, { bio: null, graduation_year: null });
});

test("save failures are safe, actionable and retryable without modifying the submitted patch", async () => {
  for (const error of [new ApiError(401, "test"), new ApiError(403, "test"), new ApiError(422, "test"), new ApiError(429, "test"), new Error("private upstream body")]) {
    const state = await action({ error });
    const patch = { headline: "Unsaved headline" };
    const result = await state.save(patch);
    assert.ok(result.error);
    assert.equal(result.profile, undefined);
    assert.deepEqual(patch, { headline: "Unsaved headline" });
    assert.doesNotMatch(result.error, /private upstream body/);
    assert.equal(state.revalidated.length, 0);
  }
});

test("invalid inputs, unavailable/guest accounts and mismatched backend owners cannot succeed", async () => {
  const invalid = await action();
  assert.ok((await invalid.save({ graduation_year: 9999 })).fields.graduation_year);
  assert.equal(invalid.writes.length, 0);
  for (const kind of ["guest", "unavailable", "profile-error"]) {
    const state = await action({ state: { kind } });
    assert.ok((await state.save({ bio: "Edited" })).error);
    assert.equal(state.writes.length, 0);
  }
  for (const response of [{ ...profile, user_id: "another-user" }, { ...profile, id: "another-profile" }, { ...profile, bio: 123 }]) {
    const state = await action({ response });
    assert.ok((await state.save({ bio: "Edited" })).error);
    assert.equal(state.revalidated.length, 0);
  }
});
