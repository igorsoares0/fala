import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { getCaptionTrack, retryTranscription } from "./transcription";
import { getSourceUrl, startUpload } from "./uploads";

const owner = { id: `test-tr-owner-${randomUUID()}`, name: "Owner", email: `tr-owner-${randomUUID()}@test.local`, emailVerified: true };
const intruder = { id: `test-tr-intruder-${randomUUID()}`, name: "Intruder", email: `tr-intruder-${randomUUID()}@test.local` };

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

const words = [
  { text: "Hello", startMs: 0, endMs: 300 },
  { text: "there.", startMs: 350, endMs: 700 },
];

/** A project as the worker leaves it: validated, with or without captions. */
async function processedProject(data: { status: "READY" | "FAILED"; errorCode?: string }) {
  const project = await db.project.create({
    data: {
      userId: owner.id,
      name: "Talk",
      sourceObjectKey: `users/${owner.id}/projects/x/source/abc.mp4`,
      thumbnailObjectKey: `users/${owner.id}/projects/x/thumbnails/abc.jpg`,
      durationMs: 1000,
      captionSample: ["Hello", "there."],
      ...data,
    },
  });
  await db.transcript.create({
    data: { projectId: project.id, sourceObjectKey: project.sourceObjectKey!, provider: "fake", fullText: "Hello there.", words },
  });
  await db.captionTrack.create({
    data: { projectId: project.id, language: "en", words, blocks: [{ id: "b1", wordStart: 0, wordEnd: 1, startMs: 0, endMs: 920 }] },
  });
  return project.id;
}

describe("retrying transcription", () => {
  it("re-queues transcription of the stored video, once, for the owner only", async () => {
    const id = await processedProject({ status: "FAILED", errorCode: "TRANSCRIPTION_FAILED" });

    expect(await retryTranscription(intruder.id, id)).toMatchObject({ ok: false, status: 404 });
    expect(await retryTranscription(owner.id, id)).toEqual({ ok: true });
    expect(await retryTranscription(owner.id, id)).toMatchObject({ ok: false, status: 409 });

    expect(await db.project.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PROCESSING", errorCode: null });
    const jobs = await db.job.findMany({ where: { projectId: id } });
    expect(jobs).toMatchObject([{ type: "TRANSCRIBE_VIDEO", status: "PENDING" }]);
  });

  it("refuses failures that a retry can't fix", async () => {
    const id = await processedProject({ status: "FAILED", errorCode: "NO_SPEECH" });
    expect(await retryTranscription(owner.id, id)).toMatchObject({ ok: false, status: 409 });
    expect(await db.job.count({ where: { projectId: id } })).toBe(0);
  });
});

describe("captions access", () => {
  it("returns the validated caption track to the owner only", async () => {
    const id = await processedProject({ status: "READY" });
    expect(await getCaptionTrack(intruder.id, id)).toBeNull();
    expect(await getCaptionTrack(owner.id, id)).toMatchObject({
      version: 1,
      track: { language: "en", words, blocks: [{ id: "b1" }] },
    });
  });

  it("signs the video for the owner only", async () => {
    const id = await processedProject({ status: "READY" });
    expect(await getSourceUrl(intruder.id, id)).toBeNull();
    expect(await getSourceUrl(owner.id, id)).toMatch(/X-Amz-Signature=/);
  });

  it("forgets the old captions when another file is uploaded", async () => {
    const id = await processedProject({ status: "FAILED", errorCode: "NO_SPEECH" });
    expect((await startUpload(owner.id, id, { mimeType: "video/mp4", sizeBytes: 10 })).ok).toBe(true);

    expect(await db.project.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "UPLOADING", captionSample: null });
    expect(await db.transcript.count({ where: { projectId: id } })).toBe(0);
    expect(await db.captionTrack.count({ where: { projectId: id } })).toBe(0);
    expect(await getSourceUrl(owner.id, id)).toBeNull();
  });
});
