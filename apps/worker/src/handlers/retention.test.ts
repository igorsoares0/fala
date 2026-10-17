import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, enqueueJob } from "@fala/db";
import { DAY_MS, exportKey, sourceKey } from "@fala/shared";
import { createRunner } from "../runner";
import { createTestUser, testConfig, testStorage } from "../test-support";

const config = testConfig();
const storage = testStorage();
let userId: string;

beforeAll(async () => {
  userId = await createTestUser();
});
beforeEach(async () => {
  await db.job.deleteMany({});
});
afterAll(async () => {
  await storage.deletePrefix(`users/${userId}/`);
  await db.job.deleteMany({});
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function project(lastActiveDays: number, warnedDays?: number) {
  const created = await db.project.create({
    data: { userId, name: "Old trip", status: "READY", lastActiveAt: daysAgo(lastActiveDays), sourceExpiryWarnedAt: warnedDays === undefined ? null : daysAgo(warnedDays) },
  });
  const key = sourceKey(userId, created.id, "src1", "mp4");
  await storage.putObject(key, "video", "video/mp4");
  await db.project.update({ where: { id: created.id }, data: { sourceObjectKey: key } });
  return { id: created.id, key };
}

async function sweep() {
  await enqueueJob(db, "RETENTION_SWEEP", null, {});
  await createRunner({ config, storage }).processNextJob();
}

describe("RETENTION_SWEEP", () => {
  it("expires exports after 30 days and removes their files", async () => {
    const { id } = await project(1);
    const make = async (finishedDays: number) => {
      const row = await db.export.create({
        data: { projectId: id, version: Math.floor(Math.random() * 1e6), resolution: 720, snapshot: {}, status: "SUCCEEDED", completedAt: daysAgo(finishedDays) },
      });
      const key = exportKey(userId, id, row.id);
      await storage.putObject(key, "mp4", "video/mp4");
      await db.export.update({ where: { id: row.id }, data: { objectKey: key } });
      return { id: row.id, key };
    };
    const old = await make(31);
    const recent = await make(5);
    await sweep();
    expect(await db.export.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "EXPIRED", objectKey: null });
    expect(await storage.headObject(old.key)).toBeNull();
    expect(await db.export.findUniqueOrThrow({ where: { id: recent.id } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await storage.headObject(recent.key)).not.toBeNull();
  });

  it("warns once at 83 days, and removes the original only at 90 days after the warning", async () => {
    const fresh = await project(10);
    const aging = await project(84);
    const due = await project(91, 8);
    const dueButJustWarned = await project(91);

    await sweep();
    expect((await db.project.findUniqueOrThrow({ where: { id: fresh.id } })).sourceExpiryWarnedAt).toBeNull();
    expect((await db.project.findUniqueOrThrow({ where: { id: aging.id } })).sourceExpiryWarnedAt).not.toBeNull();
    expect(await db.job.count({ where: { type: "SEND_EMAIL", dedupeKey: { startsWith: `email:source-expiring:${aging.id}` } } })).toBe(1);

    expect(await db.project.findUniqueOrThrow({ where: { id: due.id } })).toMatchObject({ status: "READY" });
    expect((await db.project.findUniqueOrThrow({ where: { id: due.id } })).sourceDeletedAt).not.toBeNull();
    expect(await storage.headObject(due.key)).toBeNull();

    // Never warned (e.g. the worker was down): it gets the warning first, and its 7 days.
    expect((await db.project.findUniqueOrThrow({ where: { id: dueButJustWarned.id } })).sourceDeletedAt).toBeNull();
    expect(await storage.headObject(dueButJustWarned.key)).not.toBeNull();

    // A second sweep doesn't warn again.
    await sweep();
    expect(await db.job.count({ where: { type: "SEND_EMAIL", dedupeKey: { startsWith: `email:source-expiring:${aging.id}` } } })).toBe(1);
  });
});

describe("DELETE_ACCOUNT_ASSETS", () => {
  it("removes every file under the account, including unfinished uploads", async () => {
    const ghost = `ghost-${Date.now()}`;
    await storage.putObject(`users/${ghost}/projects/p/source/a.mp4`, "x", "video/mp4");
    const uploadId = await storage.createMultipartUpload(`users/${ghost}/projects/p/source/b.mp4`, "video/mp4");
    await enqueueJob(db, "DELETE_ACCOUNT_ASSETS", null, { userId: ghost });
    await createRunner({ config, storage }).processNextJob();
    expect(await storage.listKeys(`users/${ghost}/`)).toEqual([]);
    expect(await storage.listParts(`users/${ghost}/projects/p/source/b.mp4`, uploadId).then(() => "open", () => "gone")).toBe("gone");
  });
});
