import "server-only";
import { z } from "zod";
import { db, enqueueJob, type ExportStatus } from "@fala/db";
import { parseProjectStyle } from "./style";

/**
 * Project data access. Every function takes the owner's `userId` and scopes the
 * query by it, so a project id from another user behaves exactly like a missing one.
 * Callers must pass the id of the authenticated user (see lib/dal.ts).
 */

const projectSummarySelect = {
  id: true,
  name: true,
  status: true,
  errorCode: true,
  durationMs: true,
  width: true,
  height: true,
  thumbnailObjectKey: true,
  captionSample: true,
  style: { select: { presetKey: true, configuration: true } },
  // The newest export that's rendering or done: drives "Rendering N%" / "Exported" on the card.
  exports: {
    where: { status: { in: ["QUEUED", "RENDERING", "SUCCEEDED"] as ExportStatus[] } },
    orderBy: { version: "desc" },
    take: 1,
    select: { status: true, progress: true },
  },
  createdAt: true,
  updatedAt: true,
} as const;

type ProjectRow = Awaited<ReturnType<typeof findProjects>>[number];

const ownedAndLive = (userId: string) => ({ userId, deletedAt: null });

function findProjects(userId: string) {
  return db.project.findMany({
    where: ownedAndLive(userId),
    select: projectSummarySelect,
    orderBy: { createdAt: "desc" },
  });
}

const captionSampleSchema = z.array(z.string()).max(20);

/** Object keys stay on the server; the UI only needs to know a thumbnail exists. */
function toSummary({ thumbnailObjectKey, captionSample, style, exports, ...project }: ProjectRow) {
  const sample = captionSampleSchema.safeParse(captionSample);
  return {
    ...project,
    latestExport: exports[0] ?? null,
    hasThumbnail: thumbnailObjectKey !== null,
    captionSample: sample.success && sample.data.length > 0 ? sample.data : null,
    style: parseProjectStyle(style),
  };
}

export async function listProjects(userId: string) {
  return (await findProjects(userId)).map(toSummary);
}

export type ProjectSummary = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, ...ownedAndLive(userId) },
    select: projectSummarySelect,
  });
  return project ? toSummary(project) : null;
}

export async function createProject(userId: string, name: string) {
  return db.project.create({
    data: { userId, name },
    select: { id: true },
  });
}

/** Returns false when the project doesn't exist or isn't owned by `userId`. */
export async function renameProject(userId: string, projectId: string, name: string) {
  const { count } = await db.project.updateMany({
    where: { id: projectId, ...ownedAndLive(userId) },
    data: { name },
  });
  return count === 1;
}

/**
 * Soft delete: hides the project immediately, cancels its queued work and asks the
 * worker to remove its stored files (spec FR-16). Returns false when not owned.
 */
export async function deleteProject(userId: string, projectId: string) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id: projectId, ...ownedAndLive(userId) },
      data: { deletedAt: new Date(), status: "DELETION_PENDING" },
    });
    if (count !== 1) return false;

    await tx.job.updateMany({
      where: { projectId, status: { in: ["PENDING", "RETRY_WAIT"] } },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    await enqueueJob(tx, "DELETE_PROJECT_ASSETS", projectId, { projectId, userId }, { maxAttempts: 5 });
    return true;
  });
}
