import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { db, enqueueJob, type ProjectStatus } from "@fala/db";
import { sourceKey } from "@fala/shared";
import { createStorage, storageConfigFromEnv } from "@fala/storage";
import { loadConfig, type WorkerConfig } from "./config";

/** Helpers for the worker's integration tests (test database + test bucket). */

export const FIXTURES = path.resolve(import.meta.dirname, "../../../fixtures/media");

export function testConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    ...loadConfig({
      ...process.env,
      WORKER_ID: `test-${randomUUID().slice(0, 8)}`,
      TEMP_DIR: path.join(os.tmpdir(), "fala-worker-test"),
    }),
    ...overrides,
  };
}

export const testStorage = () => createStorage(storageConfigFromEnv());

export async function createTestUser() {
  const id = `test-worker-${randomUUID()}`;
  await db.user.create({ data: { id, name: "Worker test", email: `${id}@test.local` } });
  return id;
}

/** A project in UPLOADED state whose source object is `fixture` (uploaded to the test bucket). */
export async function createUploadedProject(userId: string, fixture: string, status: ProjectStatus = "UPLOADED") {
  const project = await db.project.create({ data: { userId, name: fixture, status }, select: { id: true } });
  const extension = path.extname(fixture).slice(1);
  const key = sourceKey(userId, project.id, randomUUID().replaceAll("-", ""), extension);
  await testStorage().uploadFile(key, path.join(FIXTURES, fixture), "application/octet-stream");
  await db.project.update({ where: { id: project.id }, data: { sourceObjectKey: key } });
  const job = await enqueueJob(db, "VALIDATE_VIDEO", project.id, { projectId: project.id, sourceObjectKey: key });
  return { projectId: project.id, sourceObjectKey: key, jobId: job.id };
}

/** A validated project waiting for transcription (status PROCESSING) with its source in the test bucket. */
export async function createProjectAwaitingTranscription(userId: string, fixture = "vertical-2s.mp4", durationMs = 2_000) {
  const project = await db.project.create({
    data: { userId, name: fixture, status: "PROCESSING", durationMs, width: 720, height: 1280 },
    select: { id: true },
  });
  const key = sourceKey(userId, project.id, randomUUID().replaceAll("-", ""), path.extname(fixture).slice(1));
  await testStorage().uploadFile(key, path.join(FIXTURES, fixture), "video/mp4");
  await db.project.update({ where: { id: project.id }, data: { sourceObjectKey: key } });
  const job = await enqueueJob(db, "TRANSCRIBE_VIDEO", project.id, { projectId: project.id, sourceObjectKey: key });
  return { projectId: project.id, sourceObjectKey: key, jobId: job.id };
}
