import { defineConfig, devices } from "@playwright/test";

// Env comes from the repo-root .env (see the `test:e2e` script). The app under
// test runs against the test database on its own port, separate from `npm run dev`.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  expect: { timeout: 10_000 },
  webServer: {
    // A production build: no on-demand compilation, so timings match real use.
    command: `next build && next start --port ${PORT}`,
    url: `${baseURL}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      BETTER_AUTH_URL: baseURL,
      AUTH_RATE_LIMIT: "off",
      // Keep the Google button deterministic (disabled) in tests.
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
