import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  timeout: 60_000, expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    { command: "node tests/local-services.mjs", url: "http://127.0.0.1:8300/auth/v1/settings", env: { E2E_SIGNED_AUTH: "1" } },
    { command: `${process.env.E2E_PYTHON ?? "uv run --project ../api python"} tests/e2e-api.py`, url: "http://127.0.0.1:8302/health", timeout: 60_000,
      gracefulShutdown: { signal: "SIGINT", timeout: 5_000 } },
    { command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3102", url: "http://127.0.0.1:3102/sign-in", timeout: 120_000,
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:8300", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_e2e_fixture",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8302", API_BASE_URL: "http://127.0.0.1:8302" } },
  ],
});
