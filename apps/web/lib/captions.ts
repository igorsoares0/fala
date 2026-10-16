import "server-only";
import { db, type Prisma } from "@fala/db";
import { blockWords, captionTrackSchema, type CaptionTrack } from "@fala/shared";

/** Caps that keep a malicious or buggy client from storing huge documents (30 minutes of fast speech is ~7,500 words). */
export const MAX_WORDS = 12_000;
const MAX_WORD_LENGTH = 100;

export type SaveCaptionsInput = { baseVersion: number; words: CaptionTrack["words"]; blocks: CaptionTrack["blocks"] };

export type SaveCaptionsResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; version: number | null; current: Pick<CaptionTrack, "words" | "blocks"> | null }
  | { ok: false; conflict: false; error: string };

/**
 * Saves the edited captions (FR-07). Optimistic concurrency: the write only lands
 * when `baseVersion` is still the stored version, so a stale tab can never
 * overwrite newer edits. The original transcript is never touched.
 */
export async function saveCaptions(userId: string, projectId: string, input: SaveCaptionsInput): Promise<SaveCaptionsResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { durationMs: true, captionTrack: { select: { language: true, version: true } } },
  });
  if (!project?.captionTrack || !project.durationMs) {
    return { ok: false, conflict: false, error: "This project doesn't have captions." };
  }

  const parsed = captionTrackSchema.safeParse({ language: project.captionTrack.language, words: input.words, blocks: input.blocks });
  if (!parsed.success) return { ok: false, conflict: false, error: "These captions aren't valid." };
  const track = parsed.data;
  const durationMs = project.durationMs;
  const tooBig = track.words.length > MAX_WORDS || track.words.some((word) => word.text.length > MAX_WORD_LENGTH);
  const pastTheVideo =
    track.words.some((word) => word.endMs > durationMs) || track.blocks.some((block) => block.endMs > durationMs);
  if (tooBig || pastTheVideo) return { ok: false, conflict: false, error: "These captions aren't valid." };

  const captionSample = track.blocks.length > 0 ? blockWords(track, track.blocks[0]).map((word) => word.text) : [];

  return db.$transaction(async (tx) => {
    const { count } = await tx.captionTrack.updateMany({
      where: { projectId, version: input.baseVersion },
      data: {
        words: track.words as unknown as Prisma.InputJsonValue,
        blocks: track.blocks as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (count !== 1) {
      // The stored captions come back so the client can tell a real conflict from its own
      // earlier save whose response never arrived (same content, newer version).
      const current = await tx.captionTrack.findUnique({ where: { projectId }, select: { version: true, words: true, blocks: true } });
      const stored = current ? captionTrackSchema.safeParse({ language: null, words: current.words, blocks: current.blocks }) : null;
      return {
        ok: false,
        conflict: true,
        version: current?.version ?? null,
        current: stored?.success ? { words: stored.data.words, blocks: stored.data.blocks } : null,
      };
    }
    await tx.project.update({ where: { id: projectId }, data: { captionSample } });
    return { ok: true, version: input.baseVersion + 1 };
  });
}
