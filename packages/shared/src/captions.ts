import { z } from "zod";

/**
 * Caption data shared by the worker (which creates it), the editor (which edits it)
 * and, later, the renderer. Times are integer milliseconds (spec §9.3).
 *
 * A caption track is `words` (each with its own timing) plus `blocks`, each covering
 * a contiguous range of words. Block text is always derived from its words, so
 * word-level timing survives every edit.
 */

const ms = z.int().min(0);

export const transcriptWordSchema = z
  .object({
    text: z.string().min(1),
    startMs: ms,
    endMs: ms,
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((word) => word.endMs > word.startMs, { message: "A word must end after it starts." });

export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const captionBlockSchema = z.object({
  id: z.string().min(1).max(32),
  /** Index of the first word in the block. */
  wordStart: z.int().min(0),
  /** Index of the last word in the block (inclusive). */
  wordEnd: z.int().min(0),
  startMs: ms,
  endMs: ms,
  /** Timing was estimated after a text edit changed the word count ("estimated timing — check it"). */
  realign: z.boolean().optional(),
});

export type CaptionBlock = z.infer<typeof captionBlockSchema>;

export const captionTrackSchema = z
  .object({
    language: z.string().max(16).nullable(),
    words: z.array(transcriptWordSchema),
    blocks: z.array(captionBlockSchema),
  })
  .superRefine((track, ctx) => {
    let expectedStart = 0;
    let previousEnd = 0;
    for (const [index, block] of track.blocks.entries()) {
      const problem =
        block.wordStart !== expectedStart
          ? "Blocks must cover the words in order, without gaps or overlaps."
          : block.wordEnd < block.wordStart || block.wordEnd >= track.words.length
            ? "A block refers to words that don't exist."
            : block.endMs <= block.startMs
              ? "A block must end after it starts."
              : block.startMs < previousEnd
                ? "Blocks must not overlap in time."
                : null;
      if (problem) {
        ctx.addIssue({ code: "custom", message: problem, path: ["blocks", index] });
        return;
      }
      expectedStart = block.wordEnd + 1;
      previousEnd = block.endMs;
    }
    if (expectedStart !== track.words.length) {
      ctx.addIssue({ code: "custom", message: "Every word must belong to a block.", path: ["blocks"] });
    }
  });

export type CaptionTrack = z.infer<typeof captionTrackSchema>;

/** Languages written without spaces between words (ISO 639-1, as transcription providers report them). */
const NO_SPACE_LANGUAGES = new Set(["zh", "ja", "th", "lo", "km", "my"]);

export function isNoSpaceLanguage(language: string | null | undefined): boolean {
  return NO_SPACE_LANGUAGES.has((language ?? "").toLowerCase().split(/[-_]/)[0]);
}

export function joinWords(words: readonly { text: string }[], language: string | null | undefined): string {
  return words.map((word) => word.text).join(isNoSpaceLanguage(language) ? "" : " ");
}

export function blockWords(track: Pick<CaptionTrack, "words">, block: CaptionBlock): TranscriptWord[] {
  return track.words.slice(block.wordStart, block.wordEnd + 1);
}

export function blockText(track: Pick<CaptionTrack, "words" | "language">, block: CaptionBlock): string {
  return joinWords(blockWords(track, block), track.language);
}

/** Index of the block playing at `timeMs`, or -1 in a gap. Time must come from the video clock. */
export function activeBlockIndex(blocks: readonly CaptionBlock[], timeMs: number): number {
  return blocks.findIndex((block) => block.startMs <= timeMs && timeMs < block.endMs);
}

/**
 * Index (within the block) of the word being spoken at `timeMs`: the last word that
 * has started. Between two words the previous one stays active, so it never flickers.
 * -1 before the block's first word.
 */
export function activeWordIndex(words: readonly TranscriptWord[], block: CaptionBlock, timeMs: number): number {
  let active = -1;
  for (let index = block.wordStart; index <= block.wordEnd; index++) {
    if (words[index].startMs <= timeMs) active = index - block.wordStart;
    else break;
  }
  return active;
}

/**
 * Cleans a provider's raw words: drops empty tokens, rounds to whole ms, keeps
 * them inside the video and in order, and guarantees every word has a duration.
 * Never invents timing by spreading words evenly (spec §9.1).
 */
export function normalizeWords(
  raw: readonly { text: string; startMs: number; endMs: number; confidence?: number }[],
  durationMs: number,
): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  const sorted = raw
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0 && Number.isFinite(word.startMs) && Number.isFinite(word.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  for (const word of sorted) {
    const startMs = Math.min(Math.max(0, Math.round(word.startMs)), Math.max(0, durationMs - 1));
    const endMs = Math.min(Math.max(startMs + 1, Math.round(word.endMs)), Math.max(startMs + 1, durationMs));
    const confidence =
      word.confidence === undefined ? undefined : Math.min(1, Math.max(0, Number(word.confidence) || 0));
    words.push(confidence === undefined ? { text: word.text, startMs, endMs } : { text: word.text, startMs, endMs, confidence });
  }
  return words;
}
