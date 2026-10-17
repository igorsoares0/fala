import { afterAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { GET } from "@/app/api/health/route";

afterAll(async () => {
  await db.workerHeartbeat.deleteMany({ where: { workerId: { startsWith: "test-health-" } } });
  delete process.env.HEALTH_TOKEN;
  await db.$disconnect();
});

describe("GET /api/health", () => {
  it("answers ok when the database is reachable, without details", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("reports the queue and workers only with the health token", async () => {
    process.env.HEALTH_TOKEN = "test-health-token-123";
    expect((await GET(new Request("http://localhost/api/health?deep=1&token=wrong-token-12345"))).status).toBe(403);

    await db.workerHeartbeat.upsert({
      where: { workerId: "test-health-worker" },
      create: { workerId: "test-health-worker", lastSeenAt: new Date(), runningJobs: 1 },
      update: { lastSeenAt: new Date(), runningJobs: 1 },
    });
    const response = await GET(new Request("http://localhost/api/health?deep=1&token=test-health-token-123"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, workers: { live: expect.any(Number) }, queue: { due: expect.any(Number) } });
  });
});
