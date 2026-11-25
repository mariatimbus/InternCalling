import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const password = "Local-E2E-Fixture-Only-2026";

async function submit(page: Page, name: string, scope: Locator | Page = page) {
  const pathname = new URL(page.url()).pathname;
  const response = page.waitForResponse((result) => result.request().method() === "POST"
    && new URL(result.url()).pathname === pathname);
  await scope.getByRole("button", { name, exact: true }).click();
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
  await page.getByRole("button", { name: "Continue without CV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Studies", exact: true })).toBeVisible();
  await page.getByLabel("Bachelor's", { exact: true }).check();
  for (const [label, value] of [["University", "Fixture University"], ["Field of study", "Computer Science"],
    ["Graduation year", "2027"], ["City (optional)", "Berlin, Germany"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
  await page.getByLabel("Skills", { exact: true }).fill("Python");
  await page.getByRole("button", { name: "Add skill", exact: true }).click();
  for (const title of ["Experience", "Personal projects", "Certifications", "Awards", "Languages", "Publications"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish and see jobs", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs/);
}

test("confirmed signup, profile, ranking, filters, save/apply/status/notes and refresh", async ({ page, request }, info) => {
  const runtimeErrors: string[] = [];
  const serverFailures: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 500) serverFailures.push(new URL(response.url()).pathname); });
  await request.post("http://127.0.0.1:8300/__test", { data: { confirmEmail: true } });
  await page.goto("/resumes");
  await expect(page).toHaveURL(/\/sign-in/);
  const email = `core-${randomUUID()}@example.invalid`;
  await signUp(page, email);
  await expect(page.getByText(/Check your email to confirm/)).toBeVisible();
  const control = await (await request.get("http://127.0.0.1:8300/__test")).json();
  await page.goto(`/auth/callback?code=${encodeURIComponent(control.confirmationCode)}`);
  await onboard(page);
  await page.screenshot({ path: info.outputPath("jobs.png"), style: "nextjs-portal { visibility: hidden }" });
  await page.goto("/profile");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "Resumes", exact: true }).click();
  await expect(page).toHaveURL(/\/resumes/);
  await expect(page.getByRole("heading", { name: "No resumes yet", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("resumes-empty.png"), style: "nextjs-portal { visibility: hidden }" });
  await page.getByRole("button", { name: "Add resume", exact: true }).click();
  const fixturePdf = await request.get("http://127.0.0.1:8302/__test/resume.pdf");
  await page.getByLabel("Select PDF", {exact:true}).setInputFiles({name:"fixture.pdf",mimeType:"application/pdf",buffer:await fixturePdf.body()});
  await page.getByRole("button", {name:"Upload PDF",exact:true}).click();
  await expect(page.getByText("resume.pdf", {exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText("resume.pdf", {exact:true})).toBeVisible();
  const originalResume = await (await page.request.get("/api/backend/workspace/resume")).json();
  await expect(page.getByText("You have 1 resume saved.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("resumes-saved.png"), style: "nextjs-portal { visibility: hidden }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const resumeAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(resumeAxe.violations).toEqual([]);
  await page.getByLabel("Actions for resume.pdf", { exact: true }).click();
  await page.getByRole("button", {name:"View PDF",exact:true}).click();
  await expect(page.getByRole("link", {name:/Open ready PDF/})).toHaveAttribute("href", /^blob:/);
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await page.getByLabel("Select PDF", { exact: true }).setInputFiles({name:"replacement.pdf",mimeType:"application/pdf",buffer:await fixturePdf.body()});
  await page.getByRole("button", { name: "Replace PDF", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/backend/workspace/resume")).json()).id).not.toBe(originalResume.id);
  await page.reload();
  await expect(page.getByText("resume.pdf", { exact: true })).toBeVisible();
  const replacedResume = await (await page.request.get("/api/backend/workspace/resume")).json();
  expect(replacedResume.id).not.toBe(originalResume.id);
  await page.getByLabel("Actions for resume.pdf", { exact: true }).click();
  await page.getByRole("button", {name:"Remove PDF",exact:true}).click();
  await page.getByRole("button", {name:"Confirm remove PDF",exact:true}).click();
  await expect(page.getByRole("heading", {name:"No resumes yet",exact:true})).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Project name (required)", {exact: true}).fill("Persistent solver project");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await expect(page.getByRole("heading", {name:"Persistent solver project",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", {name:"Persistent solver project",exact:true})).toBeVisible();
  await page.locator("main").evaluate(el => el.scrollTo(0, 0));
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("profile.png"), style: "nextjs-portal { visibility: hidden }" });
  await expect(page.getByText("Study and job preferences", { exact: true })).toHaveCount(0);
  await page.goto("/jobs");
  await page.getByLabel("Search opportunities", { exact: true }).fill("Python");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Python/);
  await expect(page.getByText("1 opportunity", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Python Engineering Intern.*View details/ }).click();
  const detail = page.getByRole("article").filter({
    has: page.getByRole("region", { name: "Opportunity information", exact: true }),
  });
  await expect(detail.getByRole("link", { name: /Apply on official site/ })).toBeInViewport();
  if (info.project.name === "desktop") {
    const reader = await detail.getByRole("region", { name: "Opportunity information", exact: true }).boundingBox();
    expect(reader?.height).toBeGreaterThan(480);
    expect(reader?.y).toBeLessThan(160);
  }
  await page.screenshot({ path: info.outputPath("opportunity.png"), style: "nextjs-portal { visibility: hidden }" });
  await detail.getByRole("heading", { name: "Responsibilities", exact: true }).scrollIntoViewIfNeeded();
  await expect(detail.getByRole("heading", { name: "Responsibilities", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("opportunity-body.png"), style: "nextjs-portal { visibility: hidden }" });
  await detail.getByRole("region", { name: "Opportunity information", exact: true }).evaluate(el => el.scrollTo(0, 0));
  await expect(detail.getByRole("link", { name: /Check the official listing/ })).toHaveCount(0);
  const tailor = detail.getByRole("button", { name: "Tailor CV & cover letter", exact: true });
  await expect(detail.getByRole("button", { name: "Status · Not tracked", exact: true })).toBeInViewport();
  await expect(tailor).toBeInViewport();
  await tailor.focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("heading", { name: /Your profile|ATS check/ })).toBeVisible();
  await detail.getByText("Review each CV item yourself", { exact: true }).click();
  await expect(detail.getByRole("button", { name: "Request tailored draft", exact: true })).toBeVisible();
  await tailor.focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("heading", { name: "Match Score", exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Eligibility", exact: true })).toBeVisible();
  // The match is explained requirement by requirement: "N of M requirements met",
  // then one box per requirement with its points.
  await expect(detail.getByText(/of \d+ requirements met|requirements met/).first()).toBeVisible();
  await expect(detail.getByText(/^\d+ \/ \d+ pts$/).first()).toBeVisible();
  const eligibilityDetails = detail.locator("details").filter({
    has: page.getByText("Eligibility details", { exact: true }),
  });
  await eligibilityDetails.locator("summary").click();
  const criteria = eligibilityDetails.getByRole("list", { name: "Eligibility criteria" });
  await expect(criteria.getByText("Opportunity does not specify a degree level", { exact: true })).toBeVisible();
  await expect(criteria.getByText("Remote opportunity; no location barrier", { exact: true })).toBeVisible();
  await tailor.click();
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
  const saved = detail.getByRole("button", { name: "Status · Saved", exact: true });
  const notes = detail.getByRole("button", { name: "Notes", exact: true });
  await saved.focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("combobox", { name: "Application status", exact: true })).toHaveValue("saved");
  await notes.focus();
  await page.keyboard.press("Space");
  await detail.getByLabel("Notes", { exact: true }).fill("Fixture application note");
  await saved.click();
  await detail.getByRole("combobox", { name: "Application status", exact: true }).selectOption("applied");
  await notes.click();
  await expect(detail.getByLabel("Notes", { exact: true })).toHaveValue("Fixture application note");
  await submit(page, "Save progress", detail);
  await expect(detail.getByRole("button", { name: "Status · Applied", exact: true })).toBeVisible();
  const fullDetails = await detail.getByRole("link", { name: "View full details" }).getAttribute("href");
  expect(fullDetails).toBeTruthy();
  await page.goto(fullDetails!);
  await page.reload();
  await expect(page.getByRole("button", { name: "Status · Applied", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit notes", exact: true }).click();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Fixture application note");
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
