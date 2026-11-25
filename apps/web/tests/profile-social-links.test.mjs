import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/profile-social-links.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const helpers = {};
new Function("exports", outputText)(helpers);

test("social links allow only secure profile URLs on the matching service", () => {
  assert.equal(helpers.validSocialLink("https://www.linkedin.com/in/bianca", "linkedin"), true);
  assert.equal(helpers.validSocialLink("https://github.com/bianca", "github"), true);
  for (const url of ["http://github.com/bianca", "https://github.com.evil.test/bianca", "https://github.com", "javascript:alert(1)"]) {
    assert.equal(helpers.validSocialLink(url, "github"), false);
  }
  assert.deepEqual(helpers.socialLinksFromMetadata({ profile_linkedin_url: "https://www.linkedin.com/in/bianca", profile_github_url: "javascript:alert(1)" }), {
    linkedin: "https://www.linkedin.com/in/bianca", github: "",
  });
});

test("saving social links writes verified account metadata and returns persisted values", async () => {
  const actionSource = await readFile(new URL("../src/app/(workspace)/profile/social-actions.ts", import.meta.url), "utf8");
  const { outputText: actionCode } = ts.transpileModule(actionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const writes = [], revalidated = [];
  const modules = {
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "@/lib/auth/account": { getVerifiedAuth: async () => ({ kind: "signed-in", user: { id: "user-1" } }) },
    "@/lib/auth/supabase-server": { createServerSupabaseClient: async () => ({ auth: { updateUser: async ({ data }) => {
      writes.push(data); return { data: { user: { id: "user-1", user_metadata: data } }, error: null };
    } } }) },
    "@/lib/profile-social-links": helpers,
  };
  const action = {};
  new Function("require", "exports", actionCode)((name) => modules[name], action);
  const links = { linkedin: "https://www.linkedin.com/in/bianca", github: "https://github.com/bianca" };
  assert.deepEqual((await action.saveSocialLinks(links)).links, links);
  assert.deepEqual(writes, [{ profile_linkedin_url: links.linkedin, profile_github_url: links.github }]);
  assert.deepEqual(revalidated, ["/profile"]);
  assert.equal((await action.saveSocialLinks({ ...links, github: "https://evil.test/bianca" })).error.includes("valid"), true);
  assert.equal(writes.length, 1);
});
