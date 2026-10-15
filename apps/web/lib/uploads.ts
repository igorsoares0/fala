import "server-only";
import { randomUUID } from "node:crypto";
import { db, enqueueJob, type ProjectStatus } from "@fala/db";
import {
  ACCEPTED_VIDEO_TYPES,
  sourceKey,
  UPLOAD_LIMITS,
  type PresignRequest,
  type PresignResponse,
  type ProjectErrorCode,
} from "@fala/shared";
import { getStorage } from "@fala/storage";

/**
 * Upload flow (spec FR-03): the browser asks for a presigned URL, PUTs the file
 * straight to object storage, then asks us to confirm. Only the confirmation —
 * after checking the stored object — moves the project forward and queues
 * validation. Like lib/projects.ts, everything is scoped by the owner's id.
 */

export type UploadResult<T> = { ok: true; data: T } | { ok: false; status: 404 | 409; error: string };

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const THUMBNAIL_URL_TTL_SECONDS = 5 * 60;

/** A new file can be sent until one has been accepted. */
const UPLOADABLE: ProjectStatus[] = ["CREATED", "UPLOADING", "FAILED"];

const NOT_FOUND = { ok: false, status: 404, error: "This project doesn't exist anymore." } as const;

function findOwned(userId: string, projectId: string) {
  return db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { status: true, sourceObjectKey: true, sourceMimeType: true, thumbnailObjectKey: true },
  });
}

export async function startUpload(
  userId: string,
  projectId: string,
  { mimeType }: PresignRequest,
): Promise<UploadResult<PresignResponse>> {
  const project = await findOwned(userId, projectId);
  if (!project) return NOT_FOUND;
  if (!UPLOADABLE.includes(project.status)) {
    return { ok: false, status: 409, error: "This project already has a video." };
  }

  const uploadId = randomUUID().replaceAll("-", "");
  const key = sourceKey(userId, projectId, uploadId, ACCEPTED_VIDEO_TYPES[mimeType]);
  const { count } = await db.project.updateMany({
    where: { id: projectId, userId, deletedAt: null, status: { in: UPLOADABLE } },
    data: {
      status: "UPLOADING",
      sourceObjectKey: key,
      sourceMimeType: mimeType,
      errorCode: null,
    },
  });
  if (count !== 1) return { ok: false, status: 409, error: "This project already has a video." };

  const storage = getStorage();
  // A previous attempt's file was never accepted; it's garbage now.
  if (project.sourceObjectKey && project.sourceObjectKey !== key) {
    await storage.deleteObject(project.sourceObjectKey).catch(() => {});
  }

  const uploadUrl = await storage.presignPut(key, mimeType, UPLOAD_URL_TTL_SECONDS);
  return {
    ok: true,
    data: {
      uploadUrl,
      contentType: mimeType,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    },
  };
}

/**
 * Confirms the upload by inspecting the stored object, then queues validation in
 * the same transaction as the status change. Safe to call twice.
 */
export async function completeUpload(
  userId: string,
  projectId: string,
): Promise<UploadResult<{ status: ProjectStatus; errorCode: ProjectErrorCode | null }>> {
  const project = await findOwned(userId, projectId);
  if (!project) return NOT_FOUND;
  if (project.status !== "UPLOADING" || !project.sourceObjectKey) {
    // Already confirmed (a retried request): report where it is now.
    if (!UPLOADABLE.includes(project.status)) return { ok: true, data: { status: project.status, errorCode: null } };
    return { ok: false, status: 409, error: "Start the upload first." };
  }

  const key = project.sourceObjectKey;
  const storage = getStorage();
  const stored = await storage.headObject(key);

  const problem: ProjectErrorCode | null = !stored || stored.sizeBytes === 0
    ? "UPLOAD_MISSING"
    : stored.sizeBytes > UPLOAD_LIMITS.maxBytes
      ? "FILE_TOO_LARGE"
      : stored.contentType !== project.sourceMimeType
        ? "UNSUPPORTED_FILE"
        : null;

  const stillThisUpload = { id: projectId, userId, deletedAt: null, status: "UPLOADING" as const, sourceObjectKey: key };

  if (problem) {
    await db.project.updateMany({ where: stillThisUpload, data: { status: "FAILED", errorCode: problem } });
    if (stored) await storage.deleteObject(key).catch(() => {});
    return { ok: true, data: { status: "FAILED", errorCode: problem } };
  }

  await db.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({ where: stillThisUpload, data: { status: "UPLOADED" } });
    // count 0: a concurrent confirmation won the race; it queued the job.
    if (count === 1) {
      await enqueueJob(tx, "VALIDATE_VIDEO", projectId, { projectId, sourceObjectKey: key });
    }
  });
  return { ok: true, data: { status: "UPLOADED", errorCode: null } };
}

/** Short-lived URL for the project's thumbnail, or null when it has none (or isn't the caller's). */
export async function getThumbnailUrl(userId: string, projectId: string): Promise<string | null> {
  const project = await findOwned(userId, projectId);
  if (!project?.thumbnailObjectKey) return null;
  return getStorage().presignGet(project.thumbnailObjectKey, THUMBNAIL_URL_TTL_SECONDS);
}
