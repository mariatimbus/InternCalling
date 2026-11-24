import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const password = "Local-E2E-Fixture-Only-2026";

async function submit(page: Page, name: string) {
  const pathname = new URL(page.url()).pathname;
  const response = page.waitForResponse((result) => result.request().method() === "POST"
    && new URL(result.url()).pathname === pathname);
  await page.getByRole("button", { name, exact: true }).click();
  await (await response).finished();
}

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}
async function onboard(page: Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Bachelor's", { exact: true }).check();
  for (const [label, value] of [["University", "Fixture University"], ["Field of study", "Computer Science"],
    ["Graduation year", "2027"], ["City", "Berlin, Germany"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Show my internships", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs/);
}

test("confirmed signup, profile, ranking, filters, save/apply/status/notes and refresh", async ({ page, request }, info) => {
  const runtimeErrors: string[] = [];
  const serverFailures: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 500) serverFailures.push(new URL(response.url()).pathname); });
  await request.post("http://127.0.0.1:8300/__test", { data: { confirmEmail: true } });
  const email = `core-${randomUUID()}@example.invalid`;
  await signUp(page, email);
  await expect(page.getByText(/Check your email to confirm/)).toBeVisible();
  const control = await (await request.get("http://127.0.0.1:8300/__test")).json();
  await page.goto(`/auth/callback?code=${encodeURIComponent(control.confirmationCode)}`);
  await onboard(page);
  await page.goto("/profile");
  const fixturePdf = await request.get("http://127.0.0.1:8302/__test/resume.pdf");
  await page.getByLabel("Select PDF", {exact:true}).setInputFiles({name:"fixture.pdf",mimeType:"application/pdf",buffer:await fixturePdf.body()});
  await page.getByRole("button", {name:"Upload PDF",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Confirmed uploaded PDF",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", {name:"Confirmed uploaded PDF",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"View PDF",exact:true}).click();
  await expect(page.getByRole("link", {name:/Open ready PDF/})).toHaveAttribute("href", /^blob:/);
  await page.getByRole("button", {name:"Remove PDF",exact:true}).click();
  await page.getByRole("button", {name:"Confirm remove PDF",exact:true}).click();
  await expect(page.getByText("No PDF uploaded", {exact:true})).toBeVisible();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Project name (required)", {exact: true}).fill("Persistent solver project");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await expect(page.getByRole("heading", {name:"Persistent solver project",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", {name:"Persistent solver project",exact:true})).toBeVisible();
  await page.getByLabel("Study year", { exact: true }).selectOption("third");
  await page.getByLabel("Interests", { exact: true }).fill("python");
  await page.getByLabel("Remote preference", { exact: true }).selectOption("true");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText(/Preferences saved\. Your recommendations/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Study year", { exact: true })).toHaveValue("third");
  await page.goto("/jobs");
  await page.getByLabel("Search opportunities", { exact: true }).fill("Python");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Python/);
  await expect(page.getByText("1 opportunity", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Python Engineering Intern.*View details/ }).click();
  const detail = page.getByRole("article").filter({
    has: page.getByRole("region", { name: "Opportunity information", exact: true }),
  });
  await expect(detail.getByRole("heading", { name: "Match Score", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Eligibility", exact: true })).toBeVisible();
  const scoreBreakdown = detail.locator("details").filter({
    has: page.getByText("Score breakdown", { exact: true }),
  });
  await scoreBreakdown.locator("summary").click();
  await expect(scoreBreakdown.getByText("5 points", { exact: true })).toBeVisible();
  await expect(scoreBreakdown.getByText("15 points", { exact: true })).toBeVisible(); // remote, as preferred
  const eligibilityDetails = detail.locator("details").filter({
    has: page.getByText("Eligibility details", { exact: true }),
  });
  await eligibilityDetails.locator("summary").click();
  const criteria = eligibilityDetails.getByRole("list", { name: "Eligibility criteria" });
  await expect(criteria.getByText("Opportunity does not specify a degree level", { exact: true })).toBeVisible();
  await expect(criteria.getByText("Remote opportunity; no location barrier", { exact: true })).toBeVisible();
  await page.locator("summary:visible").filter({hasText:"Tailor resume for this job"}).click();
  await page.getByRole("button", {name:"Request tailored draft",exact:true}).click();
  await expect.poll(async () => page.locator("textarea").evaluateAll(nodes => nodes.some(node => node instanceof HTMLTextAreaElement && node.value.includes("Persistent solver project")))).toBeTruthy();
  const accept = page.getByRole("button", {name:"Accept item", exact:true});
  const itemCount = await accept.count();
  expect(itemCount).toBeGreaterThan(0);
  for(let i=0;i<itemCount;i++) await accept.nth(i).click();
  await page.getByRole("button", {name:"Save tailored draft",exact:true}).click();
  await expect(page.getByRole("button", {name:"Approve this revision",exact:true})).toBeEnabled();
  await page.getByRole("button", {name:"Approve this revision",exact:true}).click();
  await page.getByRole("button", {name:"Request approved-version PDF",exact:true}).click();
  await page.getByRole("button", {name:"Get download link",exact:true}).click();
  await expect(page.getByRole("link", {name:"Download approved resume",exact:true})).toHaveAttribute("href", /^blob:/);
  await detail.getByRole("button", { name: "Save Python Engineering Intern", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Application status", exact: true })).toHaveValue("saved");
  await page.goto("/applications?view=saved");
  await expect(page.getByRole("heading", { name: "Python Engineering Intern" })).toBeVisible();
  await page.getByRole("combobox", { name: "Application status", exact: true }).selectOption("applied");
  await page.getByLabel("Notes", { exact: true }).fill("Fixture application note");
  await submit(page, "Save progress");
  await page.goto("/applications?view=applied");
  for (const status of ["interview", "offer", "rejected"]) {
    await page.getByRole("combobox", { name: "Application status", exact: true }).selectOption(status);
    await submit(page, "Save progress");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Application status", exact: true })).toHaveValue(status);
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Fixture application note");
  }
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("tracker.png"), fullPage: true });
  await page.getByRole("button", { name: "Remove tracking", exact: true }).click();
  await expect(page.getByText("No applications yet", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs/);
  expect(runtimeErrors).toEqual([]);
  expect(serverFailures).toEqual([]);

});

test("second user cannot read, edit or delete the first user's application", async ({ request }) => {
  async function user() {
    const response = await request.post("http://127.0.0.1:8300/auth/v1/signup", { data: { email: `owner-${randomUUID()}@example.invalid`, password } });
    const body = await response.json();
    // Confirmation is exercised in the browser test; this fixture obtains an isolated protocol session.
    const session = body.access_token ? body : await (await request.post("http://127.0.0.1:8300/auth/v1/token?grant_type=password", { data: { email: body.email, password } })).json();
    return { Authorization: `Bearer ${session.access_token}` };
  }
  const owner = await user(), other = await user();
  const created = await request.post("http://127.0.0.1:8302/api/v1/applications", { headers: owner, data: { opportunity_id: "00000000-0000-0000-0000-000000000001" } });
  expect(created.status()).toBe(201);
  const application = await created.json();
  const list = await (await request.get("http://127.0.0.1:8302/api/v1/applications", { headers: other })).json();
  expect(list.items).toEqual([]);
  expect((await request.patch(`http://127.0.0.1:8302/api/v1/applications/${application.id}`, { headers: other, data: { status: "offer" } })).status()).toBe(404);
  expect((await request.delete(`http://127.0.0.1:8302/api/v1/applications/${application.id}`, { headers: other })).status()).toBe(404);
});
