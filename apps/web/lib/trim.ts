import "server-only";
import { db } from "@fala/db";
import { clampTrim, fullTrim, isTrimmed, type Trim } from "@fala/shared";
import { ACTIVE_NOW } from "./activity";

/** A project's stored trim, made valid for its video; the whole video when it has none. */
export function parseProjectTrim(row: { trimStartMs: number | null; trimEndMs: number | null }, durationMs: number): Trim {
  if (row.trimStartMs === null || row.trimEndMs === null) return fullTrim(durationMs);
  return clampTrim({ startMs: row.trimStartMs, endMs: row.trimEndMs }, durationMs);
}

export type SaveTrimResult = { ok: true; trim: Trim } | { ok: false; error: string };

/**
 * Saves which part of the video the project keeps. Nothing else changes: the
 * original file and the captions stay in source time, and the export applies the
 * trim when it renders. A trim covering the whole video is stored as none.
 */
export async function saveTrim(userId: string, projectId: string, input: Trim): Promise<SaveTrimResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { durationMs: true },
  });
  if (!project) return { ok: false, error: "This project doesn't exist anymore." };
  if (!project.durationMs) return { ok: false, error: "This project doesn't have a video to trim yet." };

  const trim = clampTrim(input, project.durationMs);
  const trimmed = isTrimmed(trim, project.durationMs);
  await db.project.updateMany({
    where: { id: projectId, userId, deletedAt: null },
    data: { trimStartMs: trimmed ? trim.startMs : null, trimEndMs: trimmed ? trim.endMs : null, ...ACTIVE_NOW() },
  });
  return { ok: true, trim };
}
