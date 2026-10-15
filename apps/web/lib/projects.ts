import "server-only";
import { db } from "@fala/db";

/**
 * Project data access. Every function takes the owner's `userId` and scopes the
 * query by it, so a project id from another user behaves exactly like a missing one.
 * Callers must pass the id of the authenticated user (see lib/dal.ts).
 */

const projectSummarySelect = {
  id: true,
  name: true,
  status: true,
  durationMs: true,
  width: true,
  height: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ownedAndLive = (userId: string) => ({ userId, deletedAt: null });

export async function listProjects(userId: string) {
  return db.project.findMany({
    where: ownedAndLive(userId),
    select: projectSummarySelect,
    orderBy: { createdAt: "desc" },
  });
}

export type ProjectSummary = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(userId: string, projectId: string) {
  return db.project.findFirst({
    where: { id: projectId, ...ownedAndLive(userId) },
    select: projectSummarySelect,
  });
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
 * Soft delete: hides the project immediately and marks it for asset cleanup,
 * which the worker performs in a later phase. Returns false when not owned.
 */
export async function deleteProject(userId: string, projectId: string) {
  const { count } = await db.project.updateMany({
    where: { id: projectId, ...ownedAndLive(userId) },
    data: { deletedAt: new Date(), status: "DELETION_PENDING" },
  });
  return count === 1;
}
