import { defineConfig, devices } from "@playwright/test";

// Env comes from the repo-root .env (see the `test:e2e` script). The app under
// test runs against the test database and bucket on its own port, separate from `npm run dev`.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

const testDatabaseAndBucket = {
  DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME_TEST ?? "",
};

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
  // Most tests upload a video and wait for the worker to validate and transcribe it.
  timeout: 60_000,
  webServer: [
    {
      // A production build: no on-demand compilation, so timings match real use.
      command: `next build && next start --port ${PORT}`,
      url: `${baseURL}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...testDatabaseAndBucket,
        BETTER_AUTH_URL: baseURL,
        AUTH_RATE_LIMIT: "off",
        // Keep the Google button deterministic (disabled) in tests.
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      },
    },
    {
      // The worker validates uploads against the same test database and bucket.
      command: "tsx ../worker/src/main.ts",
      wait: { stdout: /worker\.started/ },
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      env: {
        ...testDatabaseAndBucket,
        WORKER_CONCURRENCY: "4",
        TEMP_DIR: "/tmp/fala-worker-e2e",
        // Scripted captions, no network: E2E never calls the real transcription service.
        TRANSCRIPTION_PROVIDER: "fake",
      },
    },
  ],
});
