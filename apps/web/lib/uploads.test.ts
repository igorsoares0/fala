import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { getStorage } from "@fala/storage";
import { createProject, deleteProject } from "./projects";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { completeUpload, CONFIRM_EMAIL_FIRST, getThumbnailUrl, signUploadParts, startUpload } from "./uploads";

const owner = { id: `test-up-owner-${randomUUID()}`, name: "Owner", email: `up-owner-${randomUUID()}@test.local`, emailVerified: true };
const intruder = { id: `test-up-intruder-${randomUUID()}`, name: "Intruder", email: `up-intruder-${randomUUID()}@test.local`, emailVerified: true };
const mp4 = { mimeType: "video/mp4" as const, sizeBytes: 11 };

beforeAll(async () => {
  await db.user.createMany({ data: [owner, intruder] });
});

afterAll(async () => {
  await getStorage().deletePrefix(`users/${owner.id}/`);
  await db.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  await db.$disconnect();
});

const jobsOf = (projectId: string) => db.job.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
const row = (id: string) => db.project.findUniqueOrThrow({ where: { id } });

/** Sends `body` as the project's upload, in the parts the server planned, like the browser does. */
async function sendFile(projectId: string, body: Uint8Array<ArrayBuffer>, { skip = [] as number[] } = {}) {
  const started = await startUpload(owner.id, projectId, { mimeType: "video/mp4", sizeBytes: body.length });
  if (!started.ok) throw new Error("start failed");
  const { partSize, partCount } = started.data;
  const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1).filter((part) => !skip.includes(part));
  const signed = await signUploadParts(owner.id, projectId, partNumbers);
  if (!signed.ok) throw new Error("signing failed");
  for (const { partNumber, url } of signed.data.urls) {
    const response = await fetch(url, { method: "PUT", body: body.subarray((partNumber - 1) * partSize, partNumber * partSize) });
    expect(response.status).toBe(200);
  }
  return started.data;
}

const MB = 1024 * 1024;
const smallFile = new TextEncoder().encode("fake video!");

describe("upload flow", () => {
  it("starts an upload for the owner only, scoped to the project's prefix", async () => {
    const { id } = await createProject(owner.id, "Clip");

    expect(await startUpload(intruder.id, id, mp4)).toMatchObject({ ok: false, status: 404 });

    const result = await startUpload(owner.id, id, mp4);
    expect(result.ok).toBe(true);
    const project = await row(id);
    expect(project).toMatchObject({ status: "UPLOADING", sourceMimeType: "video/mp4", sourceSizeBytes: BigInt(mp4.sizeBytes) });
    expect(project.sourceUploadId).toBeTruthy();
    expect(project.sourceObjectKey).toMatch(new RegExp(`^users/${owner.id}/projects/${id}/source/[a-f0-9]{32}\\.mp4$`));
  });

  it("confirms an upload once every part arrived and queues exactly one validation", async () => {
    const { id } = await createProject(owner.id, "Clip");
    await sendFile(id, smallFile);

    expect(await completeUpload(intruder.id, id)).toMatchObject({ ok: false, status: 404 });
    expect(await completeUpload(owner.id, id)).toEqual({ ok: true, data: { status: "UPLOADED", errorCode: null } });
    // A retried confirmation is harmless.
    expect(await completeUpload(owner.id, id)).toMatchObject({ ok: true, data: { status: "UPLOADED" } });

    const project = await row(id);
    expect(project.sourceUploadId).toBeNull();
    expect(await getStorage().headObject(project.sourceObjectKey!)).toEqual({ sizeBytes: smallFile.length, contentType: "video/mp4" });
    const jobs = await jobsOf(id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: "VALIDATE_VIDEO",
      status: "PENDING",
      payload: { projectId: id, sourceObjectKey: project.sourceObjectKey },
    });

    // Once a file is accepted, the project doesn't take another one.
    expect(await startUpload(owner.id, id, mp4)).toMatchObject({ ok: false, status: 409 });
  });

  it("assembles a multi-part file in order, and waits while a part is missing", async () => {
    process.env.UPLOAD_PART_SIZE_BYTES = String(5 * MB);
    const dir = await mkdtemp(path.join(os.tmpdir(), "fala-upload-"));
    try {
      const { id } = await createProject(owner.id, "Long");
      const body = new Uint8Array(12 * MB).map((_, index) => index % 251);

      const plan = await sendFile(id, body, { skip: [2] });
      expect(plan).toMatchObject({ partSize: 5 * MB, partCount: 3 });
      expect(await completeUpload(owner.id, id)).toMatchObject({ ok: false, status: 409 });
      expect(await row(id)).toMatchObject({ status: "UPLOADING" });

      // Sending the missing part (a resumed upload) completes it.
      const signed = await signUploadParts(owner.id, id, [2]);
      if (!signed.ok) throw new Error("signing failed");
      await fetch(signed.data.urls[0].url, { method: "PUT", body: body.subarray(5 * MB, 10 * MB) });
      expect(await completeUpload(owner.id, id)).toMatchObject({ ok: true, data: { status: "UPLOADED" } });

      const file = path.join(dir, "source");
      await getStorage().downloadToFile((await row(id)).sourceObjectKey!, file);
      expect(Buffer.compare(await readFile(file), Buffer.from(body))).toBe(0);
    } finally {
      delete process.env.UPLOAD_PART_SIZE_BYTES;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("signs parts for the owner's upload in progress only", async () => {
    const { id } = await createProject(owner.id, "Parts");
    expect(await signUploadParts(owner.id, id, [1])).toMatchObject({ ok: false, status: 409 });
    await startUpload(owner.id, id, mp4);
    expect(await signUploadParts(intruder.id, id, [1])).toMatchObject({ ok: false, status: 404 });
    expect(await signUploadParts(owner.id, id, [2])).toMatchObject({ ok: false, status: 409 });
    expect(await signUploadParts(owner.id, id, [1])).toMatchObject({ ok: true });
  });

  it("signed part URLs take exactly the part's size, no more", async () => {
    const { id } = await createProject(owner.id, "Exact");
    await startUpload(owner.id, id, mp4);
    const signed = await signUploadParts(owner.id, id, [1]);
    if (!signed.ok) throw new Error("signing failed");
    const url = signed.data.urls[0].url;
    expect((await fetch(url, { method: "PUT", body: new Uint8Array(5 * MB) })).status).toBe(403);
    expect((await fetch(url, { method: "PUT", body: smallFile })).status).toBe(200);
  });

  it("waits for a confirmed email before starting an upload", async () => {
    const unconfirmed = { id: `test-up-unconfirmed-${randomUUID()}`, name: "New", email: `up-new-${randomUUID()}@test.local` };
    await db.user.create({ data: unconfirmed });
    try {
      const { id } = await createProject(unconfirmed.id, "Too soon");
      expect(await startUpload(unconfirmed.id, id, mp4)).toEqual({ ok: false, status: 403, error: CONFIRM_EMAIL_FIRST });
      expect(await row(id)).toMatchObject({ status: "CREATED", sourceObjectKey: null });

      await db.user.update({ where: { id: unconfirmed.id }, data: { emailVerified: true } });
      expect((await startUpload(unconfirmed.id, id, mp4)).ok).toBe(true);
    } finally {
      await getStorage().deletePrefix(`users/${unconfirmed.id}/`);
      await db.user.delete({ where: { id: unconfirmed.id } });
    }
  });

  it("starting over drops the previous unfinished upload", async () => {
    const { id } = await createProject(owner.id, "Restart");
    await startUpload(owner.id, id, mp4);
    const first = await row(id);
    await startUpload(owner.id, id, mp4);
    const second = await row(id);
    expect(second.sourceUploadId).not.toBe(first.sourceUploadId);
    // The first upload no longer accepts parts.
    expect(await getStorage().listParts(first.sourceObjectKey!, first.sourceUploadId!).then(() => "open", () => "gone")).toBe("gone");
  });

  it("doesn't confirm while nothing has arrived, and lets the user start over", async () => {
    const { id } = await createProject(owner.id, "Ghost");
    await startUpload(owner.id, id, mp4);

    expect(await completeUpload(owner.id, id)).toMatchObject({ ok: false, status: 409 });
    expect(await row(id)).toMatchObject({ status: "UPLOADING" });
    expect(await jobsOf(id)).toHaveLength(0);
    expect((await startUpload(owner.id, id, mp4)).ok).toBe(true);
  });

  it("refuses to confirm before an upload was started", async () => {
    const { id } = await createProject(owner.id, "Not yet");
    expect(await completeUpload(owner.id, id)).toMatchObject({ ok: false, status: 409 });
  });

  it("only signs thumbnails for the owner", async () => {
    const { id } = await createProject(owner.id, "With thumbnail");
    await db.project.update({ where: { id }, data: { thumbnailObjectKey: `users/${owner.id}/projects/${id}/thumbnails/x.jpg` } });

    expect(await getThumbnailUrl(intruder.id, id)).toBeNull();
    expect(await getThumbnailUrl(owner.id, id)).toMatch(/X-Amz-Signature=/);
  });
});

describe("deleting a project", () => {
  it("cancels queued work and schedules asset cleanup", async () => {
    const { id } = await createProject(owner.id, "Doomed");
    await sendFile(id, smallFile);
    await completeUpload(owner.id, id);

    expect(await deleteProject(owner.id, id)).toBe(true);

    const jobs = await jobsOf(id);
    expect(jobs.map((job) => [job.type, job.status])).toEqual([
      ["VALIDATE_VIDEO", "CANCELLED"],
      ["DELETE_PROJECT_ASSETS", "PENDING"],
    ]);
    expect(jobs[1].payload).toEqual({ projectId: id, userId: owner.id });
  });
});
