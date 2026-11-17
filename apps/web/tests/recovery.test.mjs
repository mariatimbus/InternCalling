import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Same TypeScript transpilation approach as auth.test.mjs; dependencies are isolated doubles.
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const helpers = await load("../src/lib/auth/recovery.ts");

test("recovery requires a verified recovery authentication method bound to the current user", () => {
  assert.equal(helpers.hasRecoveryClaims({ sub: "user", amr: [{ method: "recovery" }] }, "user"), true);
  for (const claims of [null, {}, { sub: "other", amr: [{ method: "recovery" }] }, { sub: "user", amr: [{ method: "password" }] }, { sub: "user", amr: ["recovery"] }]) {
    assert.equal(helpers.hasRecoveryClaims(claims, "user"), false);
  }
});

async function actions(options = {}) {
  const calls = [];
  const auth = {
    resetPasswordForEmail: async (email, settings) => { calls.push(["request", email, settings]); return { error: options.requestError ?? null }; },
    getUser: async () => ({ data: { user: options.guest ? null : { id: "synthetic-recovery-user" } }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: "synthetic-recovery-user", amr: [{ method: options.ordinary ? "password" : "recovery" }] } }, error: null }),
    updateUser: async () => { calls.push(["update"]); return { error: options.updateError ?? null }; },
    signOut: async () => { calls.push(["signout"]); return { error: options.signOutError ?? null }; },
  };
  const api = await load("../src/app/auth/recovery/actions.ts", {
    "next/headers": { headers: async () => new Headers({ origin: options.origin ?? "http://localhost:3000" }) },
    "next/navigation": { redirect: (path) => { throw Object.assign(new Error("redirect"), { path }); } },
    "@/lib/auth/recovery-server": { getRecoveryOrigin: () => "http://localhost:3000", createRecoveryClient: async () => ({ client: { auth }, commitCookies: () => calls.push(["commit"]) }) },
    "@/lib/auth/supabase-server": { createServerSupabaseClient: async () => ({ auth: { signOut: async () => { calls.push(["ordinary-signout"]); return { error: null }; } } }) },
    "@/lib/auth/recovery": helpers,
  });
  return { api, calls };
}
function form(values) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

test("only successful recovery exchanges route to reset; query destinations cannot select a redirect", () => {
  assert.equal(helpers.recoveryDestination({ error: null, data: { redirectType: "recovery", session: {} } }), "/reset-password");
  for (const data of [{ redirectType: "signup", session: {} }, { redirectType: null, session: {} }, { redirectType: "recovery", session: null }]) {
    assert.equal(helpers.recoveryDestination({ error: null, data }), "/reset-password?invalid=1");
  }
  assert.equal(helpers.recoveryDestination({ error: { code: "otp_expired" }, data: { redirectType: "recovery", session: {} } }), "/reset-password?invalid=1");
});

test("trusted origins reject remote HTTP, credentials, paths and redirect injection", () => {
  assert.equal(helpers.trustedRecoveryOrigin(), "http://localhost:3000");
  assert.equal(helpers.trustedRecoveryOrigin("https://app.example"), "https://app.example");
  for (const url of ["http://app.example", "https://user:pass@app.example", "https://app.example/evil", "https://app.example/?next=evil", "//evil.example", "javascript:alert(1)"]) {
    assert.throws(() => helpers.trustedRecoveryOrigin(url));
  }
});

test("password validation rejects empty, mismatching and overlong input without inventing a hosted policy", () => {
  assert.match(helpers.validateResetPasswords("", ""), /Enter/);
  assert.match(helpers.validateResetPasswords("synthetic-password", "different"), /do not match/);
  assert.match(helpers.validateResetPasswords("x".repeat(129), "x".repeat(129)), /128/);
  assert.equal(helpers.validateResetPasswords("synthetic-password", "synthetic-password"), null);
});

test("accepted requests are neutral and use the fixed callback; failures preserve the previous verifier", async () => {
  const accepted = await actions();
  const result = await accepted.api.requestPasswordReset({}, form({ email: "synthetic@example.test" }));
  assert.equal(result.success, helpers.recoveryAcceptedMessage);
  assert.equal(accepted.calls[0][2].redirectTo, "http://localhost:3000/auth/recovery/callback");
  assert.deepEqual(accepted.calls[1], ["commit"]);
  const limited = await actions({ requestError: { status: 429, message: "private provider body" } });
  const failure = await limited.api.requestPasswordReset({}, form({ email: "synthetic@example.test" }));
  assert.match(failure.error, /Too many requests/);
  assert.doesNotMatch(JSON.stringify(failure), /private provider body/);
  assert.equal(limited.calls.length, 1);
});

test("missing recovery identity and untrusted origins cannot update a password", async () => {
  for (const options of [{ guest: true }, { ordinary: true }, { origin: "https://untrusted.example" }]) {
    const { api, calls } = await actions(options);
    assert.ok((await api.resetPassword({}, form({ password: "synthetic-password", confirmation: "synthetic-password" }))).error);
    assert.equal(calls.length, 0);
  }
});

test("mismatches and hosted password-policy errors stay retryable and never return passwords", async () => {
  const mismatch = await actions();
  const input = form({ password: "synthetic-password", confirmation: "different-password" });
  assert.match((await mismatch.api.resetPassword({}, input)).error, /do not match/);
  assert.equal(mismatch.calls.length, 0);
  for (const error of [{ code: "weak_password" }, { code: "same_password" }, { status: 429 }, { status: 401 }, { status: 500, message: "private provider body" }]) {
    const { api, calls } = await actions({ updateError: error });
    const result = await api.resetPassword({}, form({ password: "synthetic-password", confirmation: "synthetic-password" }));
    assert.ok(result.error);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-password|private provider body/);
    assert.deepEqual(calls, [["update"]]);
  }
});

test("successful reset signs out before fixed sign-in redirect; sign-out failure offers a separate retry", async () => {
  const success = await actions();
  await assert.rejects(success.api.resetPassword({}, form({ password: "synthetic-password", confirmation: "synthetic-password" })), (error) => error.path === "/sign-in?password-reset=1");
  assert.deepEqual(success.calls, [["update"], ["signout"], ["ordinary-signout"]]);
  const failure = await actions({ signOutError: { status: 503 } });
  const result = await failure.api.resetPassword({}, form({ password: "synthetic-password", confirmation: "synthetic-password" }));
  assert.ok(result.success);
  assert.ok(result.error);
  await failure.api.finishPasswordRecovery();
  assert.equal(failure.calls.filter(([name]) => name === "update").length, 1);
});

test("callback rejects missing, invalid and non-recovery exchanges without committing cookies", async () => {
  for (const scenario of ["missing", "expired", "ordinary", "wrong-claims", "recovery"]) {
    let committed = false;
    const route = await load("../src/app/auth/recovery/callback/route.ts", {
      "next/server": { NextResponse: { redirect: (url) => ({ url: String(url), headers: new Headers() }) } },
      "@/lib/auth/recovery-server": {
        getRecoveryOrigin: () => "http://localhost:3000",
        createRecoveryClient: async () => ({ client: { auth: {
          exchangeCodeForSession: async () => ({ error: scenario === "expired" ? {} : null, data: { session: {}, user: { id: "synthetic-user" }, redirectType: scenario === "ordinary" ? null : "recovery" } }),
          getClaims: async () => ({ data: { claims: { sub: "synthetic-user", amr: [{ method: scenario === "wrong-claims" ? "password" : "recovery" }] } }, error: null }),
        } }, commitCookies: () => { committed = true; } }),
      },
      "@/lib/auth/recovery": helpers,
    });
    const response = await route.GET({ nextUrl: new URL(`http://untrusted.example/auth/recovery/callback?next=https://evil.example${scenario === "missing" ? "" : "&code=synthetic-code"}`) });
    assert.equal(response.url, `http://localhost:3000/reset-password${scenario === "recovery" ? "" : "?invalid=1"}`);
    assert.equal(committed, scenario === "recovery");
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  }
});
