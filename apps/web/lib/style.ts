import "server-only";
import { ACTIVE_NOW } from "./activity";
import { db, type Prisma } from "@fala/db";
import { DEFAULT_PROJECT_STYLE, projectStyleInputSchema, type ProjectStyleInput } from "@fala/shared";

/** A stored style, or the default one when the project has none yet (or it no longer validates). */
export function parseProjectStyle(row: { presetKey: string; configuration: unknown } | null): ProjectStyleInput {
  if (!row) return DEFAULT_PROJECT_STYLE;
  const parsed = projectStyleInputSchema.safeParse({ presetKey: row.presetKey, style: row.configuration });
  return parsed.success ? parsed.data : DEFAULT_PROJECT_STYLE;
}

export type SaveStyleResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the project's caption style (spec FR-09). Captions are not touched here: when
 * "Words per block" changes, the editor re-segments and saves the captions itself,
 * so the caption track has a single writer.
 */
export async function saveProjectStyle(userId: string, projectId: string, input: ProjectStyleInput): Promise<SaveStyleResult> {
  const owned = await db.project.count({ where: { id: projectId, userId, deletedAt: null } });
  if (owned !== 1) return { ok: false, error: "This project doesn't exist anymore." };

  const configuration = input.style as unknown as Prisma.InputJsonValue;
  await db.project.update({ where: { id: projectId }, data: ACTIVE_NOW() });
  await db.projectStyle.upsert({
    where: { projectId },
    create: { projectId, presetKey: input.presetKey, configuration },
    update: { presetKey: input.presetKey, configuration },
  });
  return { ok: true };
}
