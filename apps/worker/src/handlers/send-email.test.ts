import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, enqueueEmail } from "@fala/db";
import { renderEmail } from "../email/templates";
import { createRunner } from "../runner";
import { testConfig, testStorage } from "../test-support";

const resend = testConfig({ email: { provider: "resend", apiKey: "re_test", from: "Fala <onboarding@resend.dev>" }, appUrl: "https://fala.test" });
const storage = testStorage();

beforeEach(async () => {
  await db.job.deleteMany({});
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await db.job.deleteMany({});
  await db.$disconnect();
});

async function queue(key = `test:${Math.random()}`) {
  await enqueueEmail(db, { template: "export-ready", to: "someone@example.com", data: { name: "Ana", projectName: "Trip", projectId: "p1", resolution: 1080 }, dedupeKey: key });
  return db.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" }, orderBy: { createdAt: "desc" } });
}

describe("SEND_EMAIL", () => {
  it("posts the rendered email to Resend, keyed by the job id", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const job = await queue();
    await createRunner({ config: resend, storage }).processNextJob();

    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SUCCEEDED" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(job.id);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: "Fala <onboarding@resend.dev>", to: ["someone@example.com"], subject: '"Trip" is ready' });
    expect(body.text).toContain("https://fala.test/projects/p1");
  });

  it("retries when the provider fails, and gives up at once on a rejected message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const flaky = await queue();
    await createRunner({ config: resend, storage }).processNextJob();
    expect(await db.job.findUniqueOrThrow({ where: { id: flaky.id } })).toMatchObject({ status: "RETRY_WAIT", lastErrorCode: "EMAIL_FAILED" });

    await db.job.deleteMany({});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid to", { status: 422 })));
    const bad = await queue();
    await createRunner({ config: resend, storage }).processNextJob();
    expect(await db.job.findUniqueOrThrow({ where: { id: bad.id } })).toMatchObject({ status: "FAILED" });
  });

  it("queues one email per occurrence", async () => {
    await queue("same-occurrence");
    await queue("same-occurrence");
    expect(await db.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1);
  });

  it("prints instead of sending in development", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const job = await queue();
    await createRunner({ config: testConfig({ email: { provider: "log", from: "x" } }), storage }).processNextJob();
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SUCCEEDED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("email templates", () => {
  it("link into the app, never to a file", () => {
    for (const template of ["reset-password", "welcome", "export-ready", "usage-near-limit", "source-expiring", "account-deleted"] as const) {
      const email = renderEmail(template, { name: "Ana", url: "https://fala.test/reset?token=x", projectId: "p1", projectName: "Trip" }, "https://fala.test");
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.text).not.toContain("undefined");
      expect(email.text).not.toMatch(/\.mp4|X-Amz/);
      expect(email.html).toContain("fala");
    }
  });

  it("escapes names in HTML", () => {
    expect(renderEmail("welcome", { name: "<b>Ana</b>", minutes: 10 }, "https://fala.test").html).not.toContain("<b>Ana</b>");
  });
});
