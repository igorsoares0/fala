import "server-only";
import { db } from "@fala/db";
import { frameSchema, isOriginalFrame, normalizeFrame, ORIGINAL_FRAME, type Frame } from "@fala/shared";
import { ACTIVE_NOW } from "./activity";

/** A project's stored frame; the original when it has none or it no longer validates. */
export function parseProjectFrame(row: { frameAspect: string | null; frameFocus: number | null }): Frame {
  if (row.frameAspect === null) return ORIGINAL_FRAME;
  const parsed = frameSchema.safeParse({ aspect: row.frameAspect, focus: row.frameFocus ?? 0.5 });
  return parsed.success ? normalizeFrame(parsed.data) : ORIGINAL_FRAME;
}

export type SaveFrameResult = { ok: true; frame: Frame } | { ok: false; error: string };

/**
 * Saves the shape the project exports in. Nothing else changes: the original file
 * stays whole, and the export crops it when it renders. The original frame is
 * stored as none.
 */
export async function saveFrame(userId: string, projectId: string, input: Frame): Promise<SaveFrameResult> {
  const frame = normalizeFrame(input);
  const original = isOriginalFrame(frame);
  const { count } = await db.project.updateMany({
    where: { id: projectId, userId, deletedAt: null },
    data: { frameAspect: original ? null : frame.aspect, frameFocus: original ? null : frame.focus, ...ACTIVE_NOW() },
  });
  return count === 1 ? { ok: true, frame } : { ok: false, error: "This project doesn't exist anymore." };
}
