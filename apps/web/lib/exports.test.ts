import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { editBlockText, exportSnapshotSchema, type CaptionTrack } from "@fala/shared";
import { saveCaptions } from "./captions";
import { createExport, exportDownloadUrl, getExport, listExports, retryExport } from "./exports";

const owner = { id: `test-exp-owner-${randomUUID()}`, name: "Owner", email: `exp-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-exp-intruder-${randomUUID()}`, name: "Intruder", email: `exp-intruder-${randomUUID()}@test.local` };

const track: CaptionTrack = {
  language: "en",
  words: ["Hello", "there,", "friend."].map((text, index) => ({ text, startMs: index * 300, endMs: index * 300 + 250 })),
  blocks: [{ id: "b1", wordStart: 0, wordEnd: 2, startMs: 0, endMs: 900 }],
};

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
  // 1080p and parallel renders need a paid plan.
  const now = Date.now();
  await db.subscription.create({
    data: { userId: owner.id, planKey: "pro", currentPeriodStart: new Date(now - 86_400_000), currentPeriodEnd: new Date(now + 30 * 86_400_000) },
  });
});

// Each test starts with no render in flight (the plan limits how many run at once).
beforeEach(async () => {
  await db.export.updateMany({ where: { project: { userId: owner.id }, status: { in: ["QUEUED", "RENDERING"] } }, data: { status: "SUCCEEDED" } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

async function readyProject(name = "Lisbon trip") {
  const project = await db.project.create({
    data: {
      userId: owner.id,
      name,
      status: "READY",
      durationMs: 1000,
      width: 1080,
      height: 1920,
      sourceObjectKey: `users/${owner.id}/projects/p/source/x.mp4`,
    },
  });
  await db.captionTrack.create({ data: { projectId: project.id, language: "en", words: track.words, blocks: track.blocks } });
  return project.id;
}

const render = (userId: string, projectId: string, captionVersion = 1) =>
  createExport(userId, projectId, { resolution: 1080, captionVersion });

describe("createExport", () => {
  it("freezes the captions and style and queues one render job", async () => {
    const id = await readyProject();
    const result = await render(owner.id, id);
    expect(result).toMatchObject({ ok: true, export: { version: 1, status: "QUEUED", resolution: 1080, fileName: "lisbon-trip_v1.mp4" } });
    if (!result.ok) return;

    const row = await db.export.findUniqueOrThrow({ where: { id: result.export.id } });
    const snapshot = exportSnapshotSchema.parse(row.snapshot);
    expect(snapshot).toMatchObject({ captionVersion: 1, presetKey: "bold", width: 1080, height: 1920, durationMs: 1000, track });
    const jobs = await db.job.findMany({ where: { exportId: row.id } });
    expect(jobs).toMatchObject([{ type: "RENDER_EXPORT", maxAttempts: 2, payload: { projectId: id, exportId: row.id } }]);

    // Editing afterwards doesn't touch the frozen snapshot.
    await saveCaptions(owner.id, id, { baseVersion: 1, ...editBlockText(track, 0, "Changed after render") });
    const after = await db.export.findUniqueOrThrow({ where: { id: row.id } });
    expect(exportSnapshotSchema.parse(after.snapshot).track).toEqual(track);
  });

  it("is owner-only and needs a READY project", async () => {
    const id = await readyProject();
    expect(await render(intruder.id, id)).toMatchObject({ ok: false, status: 404 });

    const processing = await db.project.create({ data: { userId: owner.id, name: "Busy", status: "PROCESSING" } });
    expect(await render(owner.id, processing.id)).toMatchObject({ ok: false, status: 409, reason: "not-ready" });
  });

  it("refuses a snapshot of captions the editor hasn't saved yet", async () => {
    const id = await readyProject();
    expect(await render(owner.id, id, 2)).toMatchObject({ ok: false, status: 409, reason: "unsaved" });
  });

  it("returns the running render instead of queueing a second one, then numbers new versions", async () => {
    const id = await readyProject();
    const first = await render(owner.id, id);
    const again = await render(owner.id, id);
    expect(again.ok && first.ok && again.export.id === first.export.id).toBe(true);
    expect(await db.export.count({ where: { projectId: id } })).toBe(1);

    await db.export.updateMany({ where: { projectId: id }, data: { status: "SUCCEEDED" } });
    const second = await render(owner.id, id);
    expect(second).toMatchObject({ ok: true, export: { version: 2 } });
    expect((await listExports(owner.id, id))?.map((item) => item.version)).toEqual([2, 1]);
    expect(await listExports(intruder.id, id)).toBeNull();
  });
});

describe("retryExport and downloads", () => {
  it("retries only failed renders, from the same snapshot", async () => {
    const id = await readyProject();
    const created = await render(owner.id, id);
    if (!created.ok) throw new Error("not created");
    const exportId = created.export.id;

    expect(await retryExport(owner.id, exportId)).toMatchObject({ ok: false, status: 409 });
    await db.export.update({ where: { id: exportId }, data: { status: "FAILED", errorCode: "RENDER_TIMEOUT", progress: 64 } });
    expect(await getExport(owner.id, exportId)).toMatchObject({ status: "FAILED", error: { code: "RENDER_TIMEOUT" } });

    expect(await retryExport(intruder.id, exportId)).toMatchObject({ ok: false, status: 404 });
    expect(await retryExport(owner.id, exportId)).toMatchObject({ ok: true, export: { status: "QUEUED", progress: 0, error: null } });
    expect(await db.job.count({ where: { exportId } })).toBe(2);
  });

  it("signs a download only for the owner's finished export, under its friendly name", async () => {
    const id = await readyProject("Café São Paulo");
    const created = await render(owner.id, id);
    if (!created.ok) throw new Error("not created");
    const exportId = created.export.id;

    expect(await exportDownloadUrl(owner.id, exportId)).toBeNull();
    await db.export.update({ where: { id: exportId }, data: { status: "SUCCEEDED", objectKey: `users/${owner.id}/projects/${id}/exports/${exportId}.mp4` } });
    expect(await exportDownloadUrl(intruder.id, exportId)).toBeNull();

    const url = new URL((await exportDownloadUrl(owner.id, exportId))!);
    expect(url.searchParams.get("response-content-disposition")).toContain("cafe-sao-paulo_v1.mp4");
  });
});

describe("plan limits on exports", () => {
  it("keeps Free to 720p and to one render at a time across projects", async () => {
    const free = { id: `test-exp-free-${randomUUID()}`, name: "Free", email: `exp-free-${randomUUID()}@test.local` };
    await db.user.create({ data: free });
    try {
      const make = async () => {
        const project = await db.project.create({
          data: { userId: free.id, name: "Clip", status: "READY", durationMs: 1000, width: 1080, height: 1920, sourceObjectKey: "users/x/projects/y/source/z.mp4" },
        });
        await db.captionTrack.create({ data: { projectId: project.id, language: "en", words: track.words, blocks: track.blocks } });
        return project.id;
      };
      const first = await make();
      const second = await make();

      expect(await createExport(free.id, first, { resolution: 1080, captionVersion: 1 })).toMatchObject({ ok: false, status: 403, reason: "plan" });
      expect(await createExport(free.id, first, { resolution: 720, captionVersion: 1 })).toMatchObject({ ok: true });
      expect(await createExport(free.id, second, { resolution: 720, captionVersion: 1 })).toMatchObject({ ok: false, status: 409, reason: "busy" });

      await db.export.updateMany({ where: { projectId: first }, data: { status: "SUCCEEDED" } });
      expect(await createExport(free.id, second, { resolution: 720, captionVersion: 1 })).toMatchObject({ ok: true });
    } finally {
      await db.user.delete({ where: { id: free.id } });
    }
  });
});
