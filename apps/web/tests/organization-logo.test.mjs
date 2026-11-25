import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(path, deps) {
  const { outputText } = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {}; new Function("require", "exports", outputText)((name) => { assert.ok(name in deps, name); return deps[name]; }, exports); return exports;
}
const logo = await load("../src/lib/organization-logo.ts", {
  "../../../api/src/opportunity_api/ingestion/sources/employers.json": { default: [{ name: "Stripe", domain: "stripe.com" }, { name: "Arbeitnow" }] },
  "./company-logo": { companyLogoUrl: (domain) => domain ? `/company-logos/${domain}.png` : null },
});

test("issuers resolve by name, employer registry, then the credential site", () => {
  assert.equal(logo.organizationDomain("Meta"), "meta.com");
  assert.equal(logo.organizationDomain("  Forage "), "theforage.com");
  assert.equal(logo.organizationDomain("Stripe"), "stripe.com");
  assert.equal(logo.organizationDomain("Goethe-Institut"), "goethe.de");
  assert.equal(logo.organizationDomain("Frontier Technology Institute", "https://www.frontier-institute.org/cert/147"), "frontier-institute.org");
  // A credential host is not the issuer: no logo rather than a wrong one.
  assert.equal(logo.organizationDomain("Some Bootcamp", "https://www.credly.com/badges/1"), null);
  assert.equal(logo.organizationDomain("Unknown Org"), null);
  assert.equal(logo.organizationDomain("", "not a url"), null);
  assert.equal(logo.organizationLogo("Microsoft"), "/company-logos/microsoft.com.png");
});

test("dates read like a profile", () => {
  assert.equal(logo.monthYear("2026-07"), "Jul 2026");
  assert.equal(logo.monthYear("2023"), "2023");
  assert.equal(logo.monthYear("2023-13"), "2023");
  assert.equal(logo.monthYear(""), "");
});
