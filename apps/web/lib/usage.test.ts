import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { accountPeriod, confirmUsage, db, releaseUsage, reserveTranscription, transcriptionUsageKey, usageSummary } from "@fala/db";
import { createProject, deleteProject } from "./projects";
import { retryTranscription } from "./transcription";
import { OUT_OF_MINUTES, startUpload } from "./uploads";

const users: string[] = [];

async function newUser(plan?: "creator" | "pro") {
  const id = `test-usage-${randomUUID()}`;
  await db.user.create({ data: { id, name: "Usage", email: `${id}@test.local` } });
  users.push(id);
  if (plan) {
    const now = Date.now();
    await db.subscription.create({
      data: { userId: id, planKey: plan, currentPeriodStart: new Date(now - 86_400_000), currentPeriodEnd: new Date(now + 30 * 86_400_000) },
    });
  }
  return id;
}

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

const source = (projectId: string, file = "a".repeat(32)) => `users/u/projects/${projectId}/source/${file}.mp4`;
const reserve = (userId: string, projectId: string, seconds: number, file?: string) =>
  db.$transaction((tx) => reserveTranscription(tx, { userId, projectId, sourceObjectKey: source(projectId, file), seconds }));

describe("plans and periods", () => {
  it("puts users without a subscription on Free, by calendar month", async () => {
    const userId = await newUser();
    const period = await accountPeriod(db, userId, new Date(Date.UTC(2026, 9, 16, 12)));
    expect(period).toMatchObject({ plan: { key: "free", monthlyMinutes: 10 }, periodKey: "2026-10" });
    expect(period.periodStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("uses an active subscription's plan and period, and falls back to Free once it lapses", async () => {
    const userId = await newUser("creator");
    expect((await accountPeriod(db, userId)).plan.key).toBe("creator");
    expect((await accountPeriod(db, userId)).periodKey).toMatch(/^sub:/);
    expect((await accountPeriod(db, userId, new Date(Date.now() + 40 * 86_400_000))).plan.key).toBe("free");
  });
});

describe("reserving minutes", () => {
  it("reserves, confirms and releases, never charging the same file twice", async () => {
    const userId = await newUser();
    const { id } = await createProject(userId, "Clip");

    expect(await reserve(userId, id, 120)).toEqual({ ok: true });
    expect(await reserve(userId, id, 120)).toEqual({ ok: true }); // a retried job
    expect(await usageSummary(db, userId)).toMatchObject({ reservedSeconds: 120, confirmedSeconds: 0, remainingSeconds: 480 });

    await confirmUsage(db, transcriptionUsageKey(id, source(id)));
    expect(await usageSummary(db, userId)).toMatchObject({ reservedSeconds: 0, confirmedSeconds: 120 });
    // Releasing after confirmation changes nothing: spent minutes stay spent.
    await releaseUsage(db, { projectId: id });
    expect((await usageSummary(db, userId)).confirmedSeconds).toBe(120);
  });

  it("gives minutes back on failure and takes them again on retry", async () => {
    const userId = await newUser();
    const { id } = await createProject(userId, "Clip");
    await reserve(userId, id, 300);
    await releaseUsage(db, { idempotencyKey: transcriptionUsageKey(id, source(id)) });
    expect((await usageSummary(db, userId)).remainingSeconds).toBe(600);
    expect(await reserve(userId, id, 300)).toEqual({ ok: true });
    expect((await usageSummary(db, userId)).reservedSeconds).toBe(300);
  });

  it("refuses what the plan can't cover, even when requests arrive together", async () => {
    const userId = await newUser(); // Free: 600 s
    const { id } = await createProject(userId, "Clip");
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => reserve(userId, id, 180, String(index).repeat(32))),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "USAGE_LIMIT" }, { ok: false, reason: "USAGE_LIMIT" }]);
    expect((await usageSummary(db, userId)).reservedSeconds).toBe(540);
  });
});

describe("limits in the web flows", () => {
  it("refuses to start an upload once the minutes are gone", async () => {
    const userId = await newUser();
    const { id } = await createProject(userId, "Full");
    await reserve(userId, id, 600);
    const other = await createProject(userId, "Next");
    expect(await startUpload(userId, other.id, { mimeType: "video/mp4", sizeBytes: 10 })).toEqual({ ok: false, status: 409, error: OUT_OF_MINUTES });
  });

  it("deleting a project gives back minutes still held for it", async () => {
    const userId = await newUser();
    const { id } = await createProject(userId, "Doomed");
    await reserve(userId, id, 200);
    await deleteProject(userId, id);
    expect((await usageSummary(db, userId)).reservedSeconds).toBe(0);
  });

  it("retrying a failed transcription reserves again, and refuses when the minutes are gone", async () => {
    const userId = await newUser();
    const failed = await db.project.create({
      data: { userId, name: "Retry", status: "FAILED", errorCode: "TRANSCRIPTION_FAILED", durationMs: 240_000, sourceObjectKey: "" },
    });
    await db.project.update({ where: { id: failed.id }, data: { sourceObjectKey: source(failed.id) } });

    expect(await retryTranscription(userId, failed.id)).toEqual({ ok: true });
    expect((await usageSummary(db, userId)).reservedSeconds).toBe(240);

    const second = await db.project.create({
      data: { userId, name: "No room", status: "FAILED", errorCode: "TRANSCRIPTION_FAILED", durationMs: 400_000, sourceObjectKey: "" },
    });
    await db.project.update({ where: { id: second.id }, data: { sourceObjectKey: source(second.id) } });
    expect(await retryTranscription(userId, second.id)).toMatchObject({ ok: false, status: 409 });
    expect(await db.project.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "FAILED", errorCode: "USAGE_LIMIT" });
  });
});
