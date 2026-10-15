import { readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, enqueueJob } from "@fala/db";
import { projectPrefix } from "@fala/shared";
import { createStorage } from "@fala/storage";
import { createRunner } from "./runner";
import { createTestUser, createUploadedProject, testConfig, testStorage } from "./test-support";

const config = testConfig();
const storage = testStorage();
const runner = createRunner({ config, storage });
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

async function runJob(expectedJobId: string) {
  expect(await runner.processNextJob()).toBe(true);
  return db.job.findUniqueOrThrow({ where: { id: expectedJobId } });
}

const project = (id: string) => db.project.findUniqueOrThrow({ where: { id } });

describe("VALIDATE_VIDEO", () => {
  it("stores a valid vertical video's metadata and thumbnail, then queues transcription", async () => {
    const { projectId, jobId, sourceObjectKey } = await createUploadedProject(userId, "vertical-2s.mp4");

    expect(await runJob(jobId)).toMatchObject({ status: "SUCCEEDED", attempts: 1 });
    const ready = await project(projectId);
    expect(ready).toMatchObject({
      status: "PROCESSING",
      width: 720,
      height: 1280,
      videoCodec: "h264",
      audioCodec: "aac",
      errorCode: null,
    });
    expect(ready.durationMs).toBeGreaterThanOrEqual(1_950);
    expect(ready.durationMs).toBeLessThanOrEqual(2_100);
    expect(await storage.headObject(ready.thumbnailObjectKey!)).toMatchObject({ contentType: "image/jpeg" });
    const queued = await db.job.findMany({ where: { projectId, type: "TRANSCRIBE_VIDEO" } });
    expect(queued).toMatchObject([{ status: "PENDING", payload: { projectId, sourceObjectKey } }]);
  });

  it("reports the display size of a video recorded sideways", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "rotated-2s.mp4");
    await runJob(jobId);
    expect(await project(projectId)).toMatchObject({ status: "PROCESSING", width: 720, height: 1280 });
  });

  it("accepts WEBM", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "landscape-2s.webm");
    await runJob(jobId);
    expect(await project(projectId)).toMatchObject({ status: "PROCESSING", width: 640, height: 360, videoCodec: "vp9" });
  });

  it("fails a video without audio right away, without retrying", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "no-audio-2s.mp4");
    expect(await runJob(jobId)).toMatchObject({ status: "FAILED", attempts: 1, lastErrorCode: "NO_AUDIO" });
    expect(await project(projectId)).toMatchObject({ status: "FAILED", errorCode: "NO_AUDIO", thumbnailObjectKey: null });
  });

  it("fails a file that isn't a video", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "not-a-video.mp4");
    expect(await runJob(jobId)).toMatchObject({ status: "FAILED", lastErrorCode: "UNSUPPORTED_FILE" });
    expect(await project(projectId)).toMatchObject({ status: "FAILED", errorCode: "UNSUPPORTED_FILE" });
  });

  it("publishes nothing when the project moved on (deleted or re-uploaded) before the job ran", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "vertical-2s.mp4");
    await db.project.update({ where: { id: projectId }, data: { status: "DELETION_PENDING", deletedAt: new Date() } });

    expect(await runJob(jobId)).toMatchObject({ status: "SUCCEEDED" });
    expect(await project(projectId)).toMatchObject({ status: "DELETION_PENDING", thumbnailObjectKey: null });
  });

  it("retries unexpected errors with backoff, then fails the project once attempts run out", async () => {
    const { projectId, jobId } = await createUploadedProject(userId, "vertical-2s.mp4");
    const unreachable = createStorage({ ...config.storage, endpoint: "http://127.0.0.1:9" });
    const flakyRunner = createRunner({ config, storage: unreachable });

    expect(await flakyRunner.processNextJob()).toBe(true);
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "RETRY_WAIT", attempts: 1 });
    expect(await project(projectId)).toMatchObject({ status: "UPLOADED" });

    // Fast-forward to the last attempt.
    await db.job.update({ where: { id: jobId }, data: { attempts: 2, availableAt: new Date(0) } });
    expect(await flakyRunner.processNextJob()).toBe(true);
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(await project(projectId)).toMatchObject({ status: "FAILED", errorCode: "PROCESSING_FAILED" });
  });

  it("cleans up its temporary files", async () => {
    const entries = await readdir(config.tempDir).catch(() => []);
    expect(entries).toEqual([]);
  });
});

describe("DELETE_PROJECT_ASSETS", () => {
  it("removes every object and the captions of the project and marks it DELETED", async () => {
    const { projectId, jobId: validateJobId } = await createUploadedProject(userId, "vertical-2s.mp4");
    await runJob(validateJobId);
    const transcribeJob = await db.job.findFirstOrThrow({ where: { projectId, type: "TRANSCRIBE_VIDEO" } });
    await runJob(transcribeJob.id);
    expect(await db.captionTrack.count({ where: { projectId } })).toBe(1);
    const prefix = projectPrefix(userId, projectId);
    expect((await storage.listKeys(prefix)).length).toBe(2); // source + thumbnail

    await db.project.update({ where: { id: projectId }, data: { status: "DELETION_PENDING", deletedAt: new Date() } });
    const { id: deleteJobId } = await enqueueJob(db, "DELETE_PROJECT_ASSETS", projectId, { projectId, userId });

    expect(await runJob(deleteJobId)).toMatchObject({ status: "SUCCEEDED" });
    expect(await storage.listKeys(prefix)).toEqual([]);
    expect(await project(projectId)).toMatchObject({ status: "DELETED", captionSample: null });
    expect(await db.transcript.count({ where: { projectId } })).toBe(0);
    expect(await db.captionTrack.count({ where: { projectId } })).toBe(0);
  });
});
