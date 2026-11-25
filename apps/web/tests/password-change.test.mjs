import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const { outputText } = ts.transpileModule(await readFile(new URL("../src/lib/auth/password-change.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { validatePasswordChange, passwordChangeError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const base = { current: "old-Secret-1", password: "new-Secret-22", confirmation: "new-Secret-22", hasPassword: true };

test("changing a password needs the current one, a long enough match and a different value", () => {
  assert.equal(validatePasswordChange(base), null);
  assert.equal(validatePasswordChange({ ...base, current: "" }), "Enter your current password.");
  assert.equal(validatePasswordChange({ ...base, password: "short", confirmation: "short" }), "Use at least 8 characters.");
  assert.equal(validatePasswordChange({ ...base, confirmation: "other-Secret-22" }), "The new passwords do not match.");
  assert.equal(validatePasswordChange({ ...base, password: base.current, confirmation: base.current }), "Choose a password different from your current password.");
  assert.match(validatePasswordChange({ ...base, password: "x".repeat(129), confirmation: "x".repeat(129) }), /128/);
});

test("Google-only accounts set a password without a current one", () => {
  assert.equal(validatePasswordChange({ ...base, current: "", hasPassword: false }), null);
});

test("provider errors become plain, safe messages", () => {
  assert.match(passwordChangeError({ code: "weak_password" }), /policy/);
  assert.match(passwordChangeError({ code: "same_password" }), /different/);
  assert.match(passwordChangeError({ status: 429 }), /Too many attempts/);
  assert.match(passwordChangeError({ code: "reauthentication_needed" }), /sign in again/);
  assert.match(passwordChangeError({ code: "something_new" }), /could not change/);
});
