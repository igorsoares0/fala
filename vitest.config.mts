import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: path.resolve(import.meta.dirname, ".env"), quiet: true });

const webRoot = path.resolve(import.meta.dirname, "apps/web");
const migrateTestDatabase = path.resolve(import.meta.dirname, "test/migrate-test-db.ts");

// Integration tests use the test database and bucket, never the dev ones.
const testEnv = {
  DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME_TEST ?? "",
  // Tests never call a real transcription service.
  TRANSCRIPTION_PROVIDER: "fake",
};

export default defineConfig({
  test: {
    // Web and worker tests share the test database (including the job queue), so files run one at a time.
    maxWorkers: 1,
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          environment: "node",
        },
      },
      {
        resolve: {
          alias: {
            "@": webRoot,
            // `server-only` throws outside React Server Components; tests run server code directly.
            "server-only": path.resolve(webRoot, "test/server-only-stub.ts"),
          },
        },
        test: {
          name: "web",
          root: "apps/web",
          include: ["lib/**/*.test.ts"],
          environment: "node",
          globalSetup: [migrateTestDatabase],
          env: testEnv,
        },
      },
      {
        test: {
          name: "worker",
          root: "apps/worker",
          include: ["src/**/*.test.ts"],
          environment: "node",
          globalSetup: [migrateTestDatabase],
          env: testEnv,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
