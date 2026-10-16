import "server-only";
import { randomUUID } from "node:crypto";
import { db, enqueueJob, Prisma, type ProjectStatus } from "@fala/db";
import {
  ACCEPTED_VIDEO_TYPES,
  sourceKey,
  UPLOAD_LIMITS,
  uploadPartPlan,
  type PresignRequest,
  type PresignResponse,
  type ProjectErrorCode,
  type UploadPartsResponse,
} from "@fala/shared";
import { getStorage } from "@fala/storage";

/**
 * Upload flow (spec FR-03): the browser starts an upload, PUTs the file straight
 * to object storage in parts (S3 multipart, so a dropped connection costs one
 * part, not a 4 GB file), then asks us to confirm. Only the confirmation — after
 * checking every part and the stored object — moves the project forward and
 * queues validation. Like lib/projects.ts, everything is scoped by the owner's id.
 */

export type UploadResult<T> = { ok: true; data: T } | { ok: false; status: 404 | 409; error: string };

/** Part URLs are signed in small batches as the upload goes, so an hour is plenty. */
const PART_URL_TTL_SECONDS = 60 * 60;
export const THUMBNAIL_URL_TTL_SECONDS = 5 * 60;
export const SOURCE_URL_TTL_SECONDS = 60 * 60;

/** A new file can be sent until one has been accepted. */
const UPLOADABLE: ProjectStatus[] = ["CREATED", "UPLOADING", "FAILED"];

const NOT_FOUND = { ok: false, status: 404, error: "This project doesn't exist anymore." } as const;

function findOwned(userId: string, projectId: string) {
  return db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: {
      status: true,
      sourceObjectKey: true,
      sourceMimeType: true,
      sourceUploadId: true,
      sourceSizeBytes: true,
      thumbnailObjectKey: true,
    },
  });
}

/** Part size override for tests (e.g. 5 MB parts with a 12 MB file); the default suits real uploads. */
function preferredPartBytes() {
  const value = Number(process.env.UPLOAD_PART_SIZE_BYTES);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function startUpload(
  userId: string,
  projectId: string,
  { mimeType, sizeBytes }: PresignRequest,
): Promise<UploadResult<PresignResponse>> {
  const project = await findOwned(userId, projectId);
  if (!project) return NOT_FOUND;
  if (!UPLOADABLE.includes(project.status)) {
    return { ok: false, status: 409, error: "This project already has a video." };
  }

  const storage = getStorage();
  const fileId = randomUUID().replaceAll("-", "");
  const key = sourceKey(userId, projectId, fileId, ACCEPTED_VIDEO_TYPES[mimeType]);
  const multipartId = await storage.createMultipartUpload(key, mimeType);

  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id: projectId, userId, deletedAt: null, status: { in: UPLOADABLE } },
      data: {
        status: "UPLOADING",
        sourceObjectKey: key,
        sourceMimeType: mimeType,
        sourceUploadId: multipartId,
        sourceSizeBytes: BigInt(sizeBytes),
        errorCode: null,
        captionSample: Prisma.DbNull,
      },
    });
    if (count !== 1) return false;
    // Captions of a previous file must never show up for the new one.
    await tx.transcript.deleteMany({ where: { projectId } });
    await tx.captionTrack.deleteMany({ where: { projectId } });
    return true;
  });
  if (!updated) {
    await storage.abortMultipartUpload(key, multipartId).catch(() => {});
    return { ok: false, status: 409, error: "This project already has a video." };
  }

  // A previous attempt's file (or its unfinished parts) was never accepted; it's garbage now.
  if (project.sourceObjectKey && project.sourceObjectKey !== key) {
    if (project.sourceUploadId) await storage.abortMultipartUpload(project.sourceObjectKey, project.sourceUploadId).catch(() => {});
    await storage.deleteObject(project.sourceObjectKey).catch(() => {});
  }

  return { ok: true, data: { ...uploadPartPlan(sizeBytes, preferredPartBytes()), contentType: mimeType } };
}

/** Signed PUT URLs for a batch of parts of the project's upload in progress. */
export async function signUploadParts(
  userId: string,
  projectId: string,
  partNumbers: number[],
): Promise<UploadResult<UploadPartsResponse>> {
  const project = await findOwned(userId, projectId);
  if (!project) return NOT_FOUND;
  const { sourceObjectKey: key, sourceUploadId: uploadId, sourceSizeBytes } = project;
  if (project.status !== "UPLOADING" || !key || !uploadId || sourceSizeBytes === null) {
    return { ok: false, status: 409, error: "Start the upload first." };
  }
  const { partCount } = uploadPartPlan(Number(sourceSizeBytes), preferredPartBytes());
  if (partNumbers.some((partNumber) => partNumber > partCount)) {
    return { ok: false, status: 409, error: "That part isn't part of this upload." };
  }

  const storage = getStorage();
  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await storage.presignUploadPart(key, uploadId, partNumber, PART_URL_TTL_SECONDS),
    })),
  );
  return { ok: true, data: { urls } };
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

  // Assemble the parts. The ETags come from storage itself, never from the browser.
  if (project.sourceUploadId) {
    const declared = Number(project.sourceSizeBytes ?? 0);
    const { partCount } = uploadPartPlan(declared, preferredPartBytes());
    const parts = await storage.listParts(key, project.sourceUploadId).catch(() => null);
    // No upload to list: a concurrent confirmation already assembled it (the object check below decides).
    if (parts !== null) {
      const complete =
        parts.length === partCount &&
        parts.every((part, index) => part.partNumber === index + 1) &&
        parts.reduce((total, part) => total + part.sizeBytes, 0) === declared;
      if (!complete) return { ok: false, status: 409, error: "Some parts of the file haven't arrived yet." };
      await storage.completeMultipartUpload(key, project.sourceUploadId, parts);
    }
    await db.project.updateMany({
      where: { id: projectId, userId, status: "UPLOADING", sourceObjectKey: key, sourceUploadId: project.sourceUploadId },
      data: { sourceUploadId: null },
    });
  }

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

/** Signed URL of the project's video for the editor's player, or null when not the caller's. */
export async function getSourceUrl(userId: string, projectId: string): Promise<string | null> {
  const project = await findOwned(userId, projectId);
  // Only a validated video (it has a thumbnail) is streamed, never one mid-upload.
  if (!project?.sourceObjectKey || !project.thumbnailObjectKey) return null;
  if (project.status === "CREATED" || project.status === "UPLOADING") return null;
  return getStorage().presignGet(project.sourceObjectKey, SOURCE_URL_TTL_SECONDS);
}
