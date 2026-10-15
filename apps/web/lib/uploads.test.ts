import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@fala/db";
import { getStorage } from "@fala/storage";
import { createProject, deleteProject } from "./projects";
import { completeUpload, getThumbnailUrl, startUpload } from "./uploads";

const owner = { id: `test-up-owner-${randomUUID()}`, name: "Owner", email: `up-owner-${randomUUID()}@test.local` };
const intruder = { id: `test-up-intruder-${randomUUID()}`, name: "Intruder", email: `up-intruder-${randomUUID()}@test.local` };
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

async function putFile(url: string, contentType: string, body = "fake video!") {
  const response = await fetch(url, { method: "PUT", body, headers: { "Content-Type": contentType } });
  return response.status;
}

describe("upload flow", () => {
  it("presigns a PUT for the owner only, scoped to the project's prefix", async () => {
    const { id } = await createProject(owner.id, "Clip");

    expect(await startUpload(intruder.id, id, mp4)).toMatchObject({ ok: false, status: 404 });

    const result = await startUpload(owner.id, id, mp4);
    expect(result.ok).toBe(true);
    const project = await row(id);
    expect(project).toMatchObject({ status: "UPLOADING", sourceMimeType: "video/mp4" });
    expect(project.sourceObjectKey).toMatch(new RegExp(`^users/${owner.id}/projects/${id}/source/[a-f0-9]{32}\\.mp4$`));
  });

  it("confirms an upload once the object exists and queues exactly one validation", async () => {
    const { id } = await createProject(owner.id, "Clip");
    const presigned = await startUpload(owner.id, id, mp4);
    if (!presigned.ok) throw new Error("presign failed");

    // The signature covers the Content-Type: a different one is refused by storage.
    expect(await putFile(presigned.data.uploadUrl, "text/plain")).toBe(403);
    expect(await putFile(presigned.data.uploadUrl, "video/mp4")).toBe(200);

    expect(await completeUpload(intruder.id, id)).toMatchObject({ ok: false, status: 404 });
    expect(await completeUpload(owner.id, id)).toEqual({ ok: true, data: { status: "UPLOADED", errorCode: null } });
    // A retried confirmation is harmless.
    expect(await completeUpload(owner.id, id)).toMatchObject({ ok: true, data: { status: "UPLOADED" } });

    const jobs = await jobsOf(id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: "VALIDATE_VIDEO",
      status: "PENDING",
      payload: { projectId: id, sourceObjectKey: (await row(id)).sourceObjectKey },
    });

    // Once a file is accepted, the project doesn't take another one.
    expect(await startUpload(owner.id, id, mp4)).toMatchObject({ ok: false, status: 409 });
  });

  it("fails the project when the browser claims success but nothing arrived", async () => {
    const { id } = await createProject(owner.id, "Ghost");
    await startUpload(owner.id, id, mp4);

    expect(await completeUpload(owner.id, id)).toEqual({ ok: true, data: { status: "FAILED", errorCode: "UPLOAD_MISSING" } });
    expect(await row(id)).toMatchObject({ status: "FAILED", errorCode: "UPLOAD_MISSING" });
    expect(await jobsOf(id)).toHaveLength(0);

    // Trying again is allowed and clears the error.
    expect((await startUpload(owner.id, id, mp4)).ok).toBe(true);
    expect(await row(id)).toMatchObject({ status: "UPLOADING", errorCode: null });
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
    const presigned = await startUpload(owner.id, id, mp4);
    if (!presigned.ok) throw new Error("presign failed");
    await putFile(presigned.data.uploadUrl, "video/mp4");
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
