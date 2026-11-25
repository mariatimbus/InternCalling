import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

test("public and workspace routes remain accessible and responsive", async ({ page, request }, info) => {
  for (const [route, name] of [["/", "home"], ["/explore", "explore"], ["/sign-in", "sign-in"], ["/forgot-password", "recovery"]]) {
    await page.goto(route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: info.outputPath(name + ".png"), style: "nextjs-portal { visibility: hidden }" });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  await request.post("http://127.0.0.1:8300/__test", { data: { confirmEmail: false } });
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(`visual-${randomUUID()}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("Local-Visual-Fixture-Only-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Continue without CV", exact: true }).click();
  await page.getByLabel("Bachelor's", { exact: true }).check();
  for (const [label, value] of [["University", "Fixture University"], ["Field of study", "Computer Science"], ["Graduation year", "2027"], ["City (optional)", "Berlin, Germany"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Skills", { exact: true }).fill("Python");
  await page.getByRole("button", { name: "Add skill", exact: true }).click();
  for (const title of ["Experience", "Personal projects", "Certifications", "Awards", "Languages", "Publications"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish and see jobs", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs/);
  for (const route of ["/jobs", "/profile", "/resumes", "/applications", "/settings"]) {
    await page.goto(route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.screenshot({ path: info.outputPath(route.slice(1) + ".png"), style: "nextjs-portal { visibility: hidden }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  await page.goto("/jobs");
  const title = page.locator("article h3 button").first();
  await title.evaluate(el => { el.textContent = "A".repeat(100); });
  expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});
