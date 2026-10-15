import { isNoSpaceLanguage, joinWords, type CaptionBlock, type TranscriptWord } from "./captions";

/**
 * Groups timed words into caption blocks (spec §9.2, handoff "Segmentation").
 * Pure and deterministic: the worker uses it after transcription and the editor
 * re-runs it when "Words per block" changes, so word timings are never altered.
 */

export type SegmentOptions = {
  /** Most words in a block: the style's "Words per block" (maxW). */
  maxWords: number;
  /** Video duration; no block ends after it. */
  durationMs: number;
  language?: string | null;
};

/** A silence longer than this starts a new block. */
export const PAUSE_BREAK_MS = 300;
/** Blocks stay on screen this long after their last word, unless the next block starts sooner. */
export const BLOCK_END_PADDING_MS = 220;
/** Reading-comfort limits that apply whatever maxWords says. */
export const MAX_BLOCK_MS = 6_000;
const MAX_BLOCK_CHARS = 42;
const MAX_BLOCK_CHARS_NO_SPACE = 14;

const SENTENCE_END = /[.!?:…。！？：]["'”’)\]»」』]*$/;
const CLAUSE_END = /[,;，、；]["'”’)\]»」』]*$/;

export function segmentWords(words: readonly TranscriptWord[], options: SegmentOptions): CaptionBlock[] {
  const maxWords = Math.max(1, Math.floor(options.maxWords));
  const maxChars = isNoSpaceLanguage(options.language) ? MAX_BLOCK_CHARS_NO_SPACE : MAX_BLOCK_CHARS;
  const ranges: [number, number][] = [];

  const fits = (start: number, end: number) =>
    joinWords(words.slice(start, end + 1), options.language).length <= maxChars &&
    words[end].endMs - words[start].startMs <= MAX_BLOCK_MS;

  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const count = i - start + 1;
    const next = words[i + 1];
    if (!next) {
      ranges.push([start, i]);
      break;
    }

    const pauseAfter = next.startMs - words[i].endMs > PAUSE_BREAK_MS;
    const naturalBreak =
      SENTENCE_END.test(words[i].text) || (CLAUSE_END.test(words[i].text) && count >= 2) || pauseAfter;
    if (naturalBreak) {
      ranges.push([start, i]);
      start = i + 1;
      continue;
    }

    const full = count >= maxWords || !fits(start, i + 1);
    if (!full) continue;

    // Avoid leaving one word alone right before a sentence ends ("…of the / day.").
    const nextIsLoneEnding = SENTENCE_END.test(next.text) || i + 1 === words.length - 1;
    const nextIsAttached = next.startMs - words[i].endMs <= PAUSE_BREAK_MS;
    if (nextIsLoneEnding && nextIsAttached && count > 1 && fits(start, i + 1)) {
      ranges.push([start, i + 1]);
      start = i + 2;
      i += 1;
      continue;
    }
    ranges.push([start, i]);
    start = i + 1;
  }

  return toBlocks(words, ranges, options.durationMs);
}

/** Times each word range: first word's start → last word's end + padding, never past the next block or the video. */
function toBlocks(words: readonly TranscriptWord[], ranges: [number, number][], durationMs: number): CaptionBlock[] {
  const blocks: CaptionBlock[] = [];
  let previousEnd = 0;
  for (const [index, [wordStart, wordEnd]] of ranges.entries()) {
    const startMs = Math.max(words[wordStart].startMs, previousEnd);
    const nextStart = index + 1 < ranges.length ? words[ranges[index + 1][0]].startMs : Number.POSITIVE_INFINITY;
    const naturalEnd = Math.min(words[wordEnd].endMs + BLOCK_END_PADDING_MS, nextStart, durationMs);
    const endMs = Math.max(naturalEnd, startMs + 1);
    blocks.push({ id: `b${index + 1}`, wordStart, wordEnd, startMs, endMs });
    previousEnd = endMs;
  }
  return blocks;
}
