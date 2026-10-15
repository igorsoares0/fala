import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The single .env lives at the repo root.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
