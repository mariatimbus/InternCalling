import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { isProfileComplete, readOnboardingForm, validateOnboarding, onboardingPayload } = await load("../src/lib/onboarding.ts");
const { publicAuthConfig } = await load("../src/lib/auth/config.ts");
const { isProfile } = await load("../src/lib/api/types.ts");
const { createApiClient, ApiError } = await load("../src/lib/api/client.ts");
const draft = { degree_level: "bachelor", university: "Test University", field_of_study: "Computer Science", graduation_year: "2027", location: "Bucharest, Romania", skills: [] };
const profile = { id: "profile-test", user_id: "user-test", headline: null, bio: null, resume_url: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...onboardingPayload(draft) };

test("completion requires all five persisted fields but skills are optional", () => {
  assert.equal(isProfileComplete(profile), true);
  for (const key of ["degree_level", "university", "field_of_study", "graduation_year", "location"]) assert.equal(isProfileComplete({ ...profile, [key]: null }), false, key);
  assert.equal(isProfileComplete({ ...profile, university: "   " }), false);
  assert.equal(isProfileComplete({ ...profile, graduation_year: 2101 }), false);
  assert.deepEqual(validateOnboarding(draft), {});
});
test("runtime profile guard rejects incorrect field types", () => {
  assert.equal(isProfile(profile), true);
  assert.equal(isProfile({ ...profile, user_id: 1 }), false);
  assert.equal(isProfile({ ...profile, graduation_year: "2027" }), false);
  assert.equal(isProfile({ ...profile, degree_level: "doctorate" }), false);
  for (const field of ["headline", "bio", "resume_url"]) assert.equal(isProfile({ ...profile, [field]: 123 }), false);
  for (const field of ["created_at", "updated_at"]) assert.equal(isProfile({ ...profile, [field]: "invalid-date" }), false);
});
test("server validation rejects unsupported degrees, blank answers, fractional years and oversized skills", () => {
  const errors = validateOnboarding({ ...draft, degree_level: "other", university: " ", graduation_year: "2027.5", skills: ["x".repeat(101)] });
  assert.deepEqual(Object.keys(errors).sort(), ["degree_level", "graduation_year", "skills", "university"]);
  assert.ok(validateOnboarding({ ...draft, skills: Array(101).fill("test") }).skills);
});
test("form reader whitelists fields, trims and deduplicates skills", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(draft)) form.set(key, key === "skills" ? JSON.stringify([" TypeScript ", "typescript", "React"]) : value);
  form.set("user_id", "another-user"); form.set("salary", "100000");
  const result = readOnboardingForm(form);
  assert.deepEqual(result.skills, ["typescript", "react"]);
  assert.equal("user_id" in result, false); assert.equal("salary" in onboardingPayload(result), false);
  form.set("skills", "not-json"); assert.equal(readOnboardingForm(form), null);
  form.set("skills", "[123]"); assert.equal(readOnboardingForm(form), null);
});
test("public configuration accepts missing setup and publishable keys, rejects privileged keys and unsafe URLs", () => {
  assert.equal(publicAuthConfig(), null);
  assert.equal(publicAuthConfig("https://example.supabase.co", "sb_publishable_test").url, "https://example.supabase.co");
  for (const url of ["bad-url", "http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com?key=value"]) assert.throws(() => publicAuthConfig(url, "sb_publishable_test"));
  assert.throws(() => publicAuthConfig("https://example.com", "sb_secret_forbidden"));
  // Test payloads are deliberately unsigned and are used only to check key classification, never authentication.
  for (const role of ["anon", "service_role"]) {
    const value = `test.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.unsigned`;
    if (role === "anon") assert.ok(publicAuthConfig("https://example.com", value));
    else assert.throws(() => publicAuthConfig("https://example.com", value));
  }
});
test("shared API transport sends provider token, JSON, no-store, timeout and refuses redirects", async () => {
  const api = createApiClient({ baseUrl: "http://127.0.0.1:8300", getAccessToken: async () => "synthetic-test-token", transport: async (url, options) => {
    assert.equal(url.pathname, "/api/v1/profile"); assert.equal(options.headers.Authorization, "Bearer synthetic-test-token");
    assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error"); assert.ok(options.signal);
    assert.equal(options.method, "PATCH"); assert.deepEqual(JSON.parse(options.body), { location: "Test" });
    return Response.json({ ok: true });
  } });
  assert.deepEqual(await api.request("/api/v1/profile", { method: "PATCH", body: { location: "Test" } }), { ok: true });
});
test("shared API blocks cross-origin requests and missing sessions before making a request", async () => {
  let calls = 0;
  const api = createApiClient({ baseUrl: "http://127.0.0.1:8300", getAccessToken: async () => null, transport: async () => { calls++; return Response.json({}); } });
  await assert.rejects(api.request("https://other.example/api/v1/profile"), ApiError);
  await assert.rejects(api.request("/unapproved"), ApiError);
  await assert.rejects(api.request("/api/v1/profile"), (error) => error.status === 401);
  assert.equal(calls, 0);
});
test("API failures never expose upstream bodies", async () => {
  for (const status of [401, 403, 422, 429, 500]) {
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8300", getAccessToken: async () => "test", transport: async () => new Response("private upstream detail", { status }) });
    await assert.rejects(api.request("/api/v1/profile"), (error) => error.status === status && !error.message.includes("private upstream"));
  }
  const api = createApiClient({ baseUrl: "http://127.0.0.1:8300", getAccessToken: async () => "test", transport: async () => { throw new Error("private token"); } });
  await assert.rejects(api.request("/api/v1/profile"), (error) => error.status === 503 && !error.message.includes("private token"));
});

test("public catalog reads never request or forward an account token", async () => {
  let tokens = 0;
  const api = createApiClient({ baseUrl: "http://127.0.0.1:8300", getAccessToken: async () => { tokens++; return "private-session"; }, transport: async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ items: [] });
  } });
  await api.request("/api/v1/opportunities?is_active=true", { authentication: "none" });
  assert.equal(tokens, 0);
  await assert.rejects(api.request("/api/v1/profile", { authentication: "none" }), ApiError);
  await assert.rejects(api.request("/api/v1/opportunities", { authentication: "none", method: "POST" }), ApiError);
});

test("social provider input accepts only the three supported Supabase providers", async () => {
  const { isSocialProvider, socialProviderName, visibleSocialProviders } = await load("../src/lib/auth/social-providers.ts");
  assert.deepEqual(visibleSocialProviders.map((provider) => provider.id), ["google", "linkedin_oidc"]);
  for (const value of ["google", "apple", "linkedin_oidc"]) assert.equal(isSocialProvider(value), true);
  for (const value of ["linkedin", "unknown", null, "https://untrusted.example"]) assert.equal(isSocialProvider(value), false);
  assert.equal(socialProviderName("linkedin_oidc"), "LinkedIn");
});

test("email quota errors are distinct from request throttling and do not promise a reset time", async () => {
  const { authErrorMessage } = await load("../src/lib/auth/error-message.ts");
  const email = authErrorMessage({ code: "over_email_send_rate_limit", status: 429 });
  const requests = authErrorMessage({ code: "over_request_rate_limit", status: 429 });
  assert.match(email, /Confirmation emails/);
  assert.match(email, /inbox and spam/);
  assert.match(email, /sign in/);
  assert.doesNotMatch(email, /few minutes|60 seconds|one hour/i);
  assert.match(requests, /Too many authentication requests/);
  assert.doesNotMatch(requests, /Confirmation emails/);
  assert.equal(authErrorMessage({ status: 429 }), requests);
  assert.equal(authErrorMessage({ code: "invalid_credentials", status: 400 }), "Check your email and password and try again.");
});
