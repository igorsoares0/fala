import "server-only";
import { db, type Prisma } from "@fala/db";
import {
  blockWords,
  captionTrackSchema,
  DEFAULT_PROJECT_STYLE,
  projectStyleInputSchema,
  segmentWords,
  type ProjectStyleInput,
} from "@fala/shared";

/** A stored style, or the default one when the project has none yet (or it no longer validates). */
export function parseProjectStyle(row: { presetKey: string; configuration: unknown } | null): ProjectStyleInput {
  if (!row) return DEFAULT_PROJECT_STYLE;
  const parsed = projectStyleInputSchema.safeParse({ presetKey: row.presetKey, style: row.configuration });
  return parsed.success ? parsed.data : DEFAULT_PROJECT_STYLE;
}

export type SaveStyleResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the project's caption style (spec FR-09). When "Words per block" changes,
 * the captions are re-segmented from their words in the same transaction, with the
 * same pure function the editor preview uses, so both agree.
 */
export async function saveProjectStyle(userId: string, projectId: string, input: ProjectStyleInput): Promise<SaveStyleResult> {
  return db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      select: {
        durationMs: true,
        style: { select: { presetKey: true, configuration: true } },
        captionTrack: { select: { language: true, words: true, blocks: true } },
      },
    });
    if (!project) return { ok: false, error: "This project doesn't exist anymore." };

    const previous = parseProjectStyle(project.style);
    const configuration = input.style as unknown as Prisma.InputJsonValue;
    await tx.projectStyle.upsert({
      where: { projectId },
      create: { projectId, presetKey: input.presetKey, configuration },
      update: { presetKey: input.presetKey, configuration },
    });

    const track = captionTrackSchema.safeParse(project.captionTrack);
    if (track.success && project.durationMs && previous.style.maxW !== input.style.maxW) {
      const blocks = segmentWords(track.data.words, {
        maxWords: input.style.maxW,
        durationMs: project.durationMs,
        language: track.data.language,
      });
      await tx.captionTrack.update({
        where: { projectId },
        data: { blocks: blocks as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { captionSample: blockWords(track.data, blocks[0]).map((word) => word.text) },
      });
    }
    return { ok: true };
  });
}
