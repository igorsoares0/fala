import { execFileSync } from "node:child_process";
import path from "node:path";

/** Applies migrations to the test database before integration tests run. */
export default function setup() {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_TEST is not set. Copy .env.example to .env and start `docker compose up -d`.");
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, "../packages/db"),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
