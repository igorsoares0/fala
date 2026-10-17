import "server-only";
import { cache } from "react";
import { db, usageSummary } from "@fala/db";
import type { UsageSummary } from "@fala/shared";

/**
 * Plan and usage for the signed-in user's pages (spec FR-14: show the period's usage
 * and what's left). Read-only: limits are enforced where work is queued.
 */

/** One read per request, shared by the header meter and the page. */
export const getUsage = cache((userId: string): Promise<UsageSummary> => usageSummary(db, userId));

export type UsageActivity = {
  id: string;
  projectName: string;
  kind: "Transcription";
  status: "RESERVED" | "CONFIRMED" | "RELEASED";
  seconds: number;
  createdAt: string;
};

/** The latest usage entries ("Recent activity"), newest first. */
export async function recentUsage(userId: string, limit = 12): Promise<UsageActivity[]> {
  const entries = await db.usageEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, projectId: true, status: true, seconds: true, createdAt: true },
  });
  const projectIds = [...new Set(entries.flatMap((entry) => (entry.projectId ? [entry.projectId] : [])))];
  const projects = await db.project.findMany({ where: { id: { in: projectIds }, userId }, select: { id: true, name: true, deletedAt: true } });
  const names = new Map(projects.map((project) => [project.id, project.deletedAt ? `${project.name} (deleted)` : project.name]));
  return entries.map((entry) => ({
    id: entry.id,
    projectName: (entry.projectId && names.get(entry.projectId)) || "Deleted project",
    kind: "Transcription",
    status: entry.status,
    seconds: entry.seconds,
    createdAt: entry.createdAt.toISOString(),
  }));
}
