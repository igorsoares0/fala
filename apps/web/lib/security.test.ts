import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { productionEnvProblems } from "./env";
import { RATE_LIMITS, takeToken } from "./rate-limit";

const root = path.resolve(import.meta.dirname, "..");

function files(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? files(full, match) : match.test(entry) ? [full] : [];
  });
}

/** Endpoints that are public on purpose, each with its own check. */
const PUBLIC_ROUTES = new Set([
  "app/api/auth/[...all]/route.ts", // Better Auth's own endpoints
  "app/api/webhooks/paddle/route.ts", // verified by Paddle's signature
  "app/api/health/route.ts", // no data; the deep check needs HEALTH_TOKEN
]);

describe("authorization audit", () => {
  it("every API route requires a signed-in user, except the documented public ones", () => {
    const routes = files(path.join(root, "app/api"), /^route\.ts$/).map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
    expect(routes.length).toBeGreaterThan(8);
    for (const route of routes) {
      if (PUBLIC_ROUTES.has(route)) continue;
      const source = readFileSync(path.join(root, route), "utf8");
      const handlers = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
      const guarded = source.match(/withUser\(/g) ?? [];
      expect(guarded.length, `${route} must wrap every handler in withUser`).toBeGreaterThanOrEqual(handlers.length);
    }
  });

  it("every server action requires the user before doing anything else", () => {
    for (const file of files(path.join(root, "lib"), /-actions\.ts$/)) {
      const chunks = readFileSync(file, "utf8").split("export async function ").slice(1);
      expect(chunks.length, file).toBeGreaterThan(0);
      for (const chunk of chunks) {
        const name = chunk.slice(0, chunk.indexOf("("));
        const body = chunk.slice(0, chunk.indexOf("\n}\n"));
        const firstAwait = body.indexOf("await ");
        expect(body.slice(firstAwait, firstAwait + 21), `${path.basename(file)} ${name}`).toBe("await requireUser();\n".slice(0, 21));
      }
    }
  });
});

describe("rate limits", () => {
  const users: string[] = [];
  afterAll(async () => {
    await db.rateLimitBucket.deleteMany({ where: { key: { contains: "test-rate-" } } });
    await db.$disconnect();
    void users;
  });

  it("allows up to the limit per window, then refuses until the next window", async () => {
    const userId = `test-rate-${randomUUID()}`;
    const { limit, windowMs } = RATE_LIMITS.export;
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: limit + 3 }, () => takeToken("export", userId, now)));
    expect(results.filter(Boolean)).toHaveLength(limit);
    expect(await takeToken("export", userId, now + windowMs)).toBe(true);
  });
});

describe("production configuration", () => {
  const complete = {
    DATABASE_URL: "postgresql://x",
    BETTER_AUTH_SECRET: "s".repeat(40),
    BETTER_AUTH_URL: "https://fala.example",
    APP_URL: "https://fala.example",
    R2_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "very-secret-value",
    R2_BUCKET_NAME: "fala",
    PADDLE_ENV: "production",
    PADDLE_API_KEY: "pdl_live_x",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "live_x",
    PADDLE_WEBHOOK_SECRET: "ntf",
    PADDLE_PRICE_CREATOR_MONTHLY: "pri_1",
    PADDLE_PRICE_CREATOR_YEARLY: "pri_2",
    PADDLE_PRICE_PRO_MONTHLY: "pri_3",
    PADDLE_PRICE_PRO_YEARLY: "pri_4",
  };

  it("names what's missing or wrong, never the values", () => {
    const problems = productionEnvProblems({ ...complete, PADDLE_ENV: "sandbox", APP_URL: "http://fala.example", R2_SECRET_ACCESS_KEY: "" });
    expect(problems.join("\n")).toMatch(/PADDLE_ENV/);
    expect(problems.join("\n")).toMatch(/APP_URL: must be https/);
    expect(problems.join("\n")).toMatch(/R2_SECRET_ACCESS_KEY/);
    expect(problems.join("\n")).not.toContain("very-secret-value");
  });

  it("holds production back while the legal pages still have placeholders", () => {
    expect(productionEnvProblems(complete).some((problem) => problem.startsWith("lib/legal.ts"))).toBe(true);
  });
});
