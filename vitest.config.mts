import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: path.resolve(import.meta.dirname, ".env"), quiet: true });

const webRoot = path.resolve(import.meta.dirname, "apps/web");

export default defineConfig({
  test: {
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
          globalSetup: ["test/global-setup.ts"],
          env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
          // Integration tests share one database.
          fileParallelism: false,
        },
      },
    ],
  },
});
