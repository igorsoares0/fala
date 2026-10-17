import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, transcriptionUsageKey } from "@fala/db";
import { blockText, captionTrackSchema } from "@fala/shared";
import { extractAudio } from "../media/audio";
import { probeFile } from "../media/probe";
import { createRunner } from "../runner";
import { createProjectAwaitingTranscription, createTestUser, FIXTURES, testConfig, testStorage } from "../test-support";
import { createFakeProvider } from "../transcription/fake";

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

const run = (behavior: "speech" | "silence" | "fail" = "speech") =>
  createRunner({ config, storage, transcriber: createFakeProvider({ behavior }) }).processNextJob();

const job = (id: string) => db.job.findUniqueOrThrow({ where: { id } });
const project = (id: string) => db.project.findUniqueOrThrow({ where: { id } });

describe("extractAudio", () => {
  it("produces a mono 16 kHz audio file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fala-audio-"));
    try {
      const output = path.join(dir, "audio.m4a");
      await extractAudio(config.ffmpegPath, path.join(FIXTURES, "vertical-2s.mp4"), output);
      expect((await stat(output)).size).toBeGreaterThan(0);
      const probe = await probeFile(config.ffprobePath, output);
      expect(probe.streams).toMatchObject([{ codec_type: "audio", codec_name: "aac", channels: 1 }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** The minutes validation reserved for this transcription. */
async function reserved(projectId: string, sourceObjectKey: string) {
  const idempotencyKey = transcriptionUsageKey(projectId, sourceObjectKey);
  await db.usageEntry.create({ data: { userId, projectId, periodKey: "test", usageType: "TRANSCRIPTION", seconds: 2, idempotencyKey } });
  return () => db.usageEntry.findUniqueOrThrow({ where: { idempotencyKey } });
}

describe("TRANSCRIBE_VIDEO usage", () => {
  it("confirms the reserved minutes when captions are ready", async () => {
    const { projectId, sourceObjectKey } = await createProjectAwaitingTranscription(userId);
    const entry = await reserved(projectId, sourceObjectKey);
    await run();
    expect(await entry()).toMatchObject({ status: "CONFIRMED" });
  });

  it("gives the minutes back when there was nothing to transcribe", async () => {
    const { projectId, sourceObjectKey } = await createProjectAwaitingTranscription(userId);
    const entry = await reserved(projectId, sourceObjectKey);
    await run("silence");
    expect(await entry()).toMatchObject({ status: "RELEASED" });
  });
});

describe("TRANSCRIBE_VIDEO", () => {
  it("stores the transcript and a valid caption track, and marks the project READY", async () => {
    const { projectId, jobId, sourceObjectKey } = await createProjectAwaitingTranscription(userId);

    await run();
    expect(await job(jobId)).toMatchObject({ status: "SUCCEEDED" });

    const ready = await project(projectId);
    expect(ready).toMatchObject({ status: "READY", errorCode: null, captionSample: ["It's", "the", "rhythm"] });

    const transcript = await db.transcript.findUniqueOrThrow({ where: { projectId } });
    expect(transcript).toMatchObject({ provider: "fake", model: "fake-1", language: "en", sourceObjectKey });
    expect(transcript.fullText).toMatch(/^It's the rhythm/);

    const stored = await db.captionTrack.findUniqueOrThrow({ where: { projectId } });
    const track = captionTrackSchema.parse({ language: stored.language, words: stored.words, blocks: stored.blocks });
    expect(stored.version).toBe(1);
    expect(track.blocks.length).toBeGreaterThan(1);
    expect(blockText(track, track.blocks[0])).toBe("It's the rhythm");
    // Nothing runs past the 2-second video.
    expect(track.blocks.at(-1)!.endMs).toBeLessThanOrEqual(2_000);
  });

  it("fails with NO_SPEECH when the audio has nothing to transcribe", async () => {
    const { projectId, jobId } = await createProjectAwaitingTranscription(userId);
    await run("silence");
    expect(await job(jobId)).toMatchObject({ status: "FAILED", attempts: 1, lastErrorCode: "NO_SPEECH" });
    expect(await project(projectId)).toMatchObject({ status: "FAILED", errorCode: "NO_SPEECH" });
    expect(await db.captionTrack.count({ where: { projectId } })).toBe(0);
  });

  it("retries provider failures, then reports a retryable TRANSCRIPTION_FAILED", async () => {
    const { projectId, jobId } = await createProjectAwaitingTranscription(userId);

    await run("fail");
    expect(await job(jobId)).toMatchObject({ status: "RETRY_WAIT", lastErrorCode: "TRANSCRIPTION_FAILED" });
    expect(await project(projectId)).toMatchObject({ status: "PROCESSING" });

    await db.job.update({ where: { id: jobId }, data: { attempts: 2, availableAt: new Date(0) } });
    await run("fail");
    expect(await job(jobId)).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(await project(projectId)).toMatchObject({ status: "FAILED", errorCode: "TRANSCRIPTION_FAILED" });
  });

  it("publishes nothing when a newer upload replaced the video meanwhile", async () => {
    const { projectId, jobId } = await createProjectAwaitingTranscription(userId);
    await db.project.update({ where: { id: projectId }, data: { status: "UPLOADING", sourceObjectKey: "replaced" } });

    await run();
    expect(await job(jobId)).toMatchObject({ status: "SUCCEEDED" });
    expect(await project(projectId)).toMatchObject({ status: "UPLOADING", captionSample: null });
    expect(await db.transcript.count({ where: { projectId } })).toBe(0);
  });
});
