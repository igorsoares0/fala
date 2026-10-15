import type { CaptionBlock, CaptionTrack, TranscriptWord } from "./captions";

/**
 * Caption edits as pure functions (handoff "Interactions & Behavior", FR-07/FR-10).
 * Each returns a new track — or the same one when the edit doesn't apply — that
 * still satisfies captionTrackSchema. Word timings only change where a text edit
 * changes the number of words, and that block is flagged for review.
 */

/** Blocks never get shorter than this through nudges. */
export const MIN_BLOCK_MS = 300;
/** One press of a nudge button. */
export const NUDGE_STEP_MS = 100;
/** After a split, the first part stays this long past its last word (unless the next word starts sooner). */
const SPLIT_PADDING_MS = 120;
/** Above this reading speed a block is flagged "fast read". */
export const FAST_READ_CHARS_PER_SECOND = 21;

type Track = Pick<CaptionTrack, "words" | "blocks">;

/** "b<n>" one above the highest numeric id, so new blocks never collide with existing ones. */
export function nextBlockId(blocks: readonly CaptionBlock[]): string {
  let max = 0;
  for (const block of blocks) {
    const match = /^b(\d+)$/.exec(block.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `b${max + 1}`;
}

/** Splits a block between `afterWord` (a track-wide word index) and the next word. */
export function splitBlock<T extends Track>(track: T, blockIndex: number, afterWord: number): T {
  const block = track.blocks[blockIndex];
  if (!block || afterWord < block.wordStart || afterWord >= block.wordEnd) return track;
  const { words } = track;

  const firstEnd = Math.max(block.startMs + 1, Math.min(words[afterWord].endMs + SPLIT_PADDING_MS, words[afterWord + 1].startMs));
  const secondStart = Math.max(words[afterWord + 1].startMs, firstEnd);
  // A block nudged shorter than its words can leave no room for the second part.
  if (secondStart >= block.endMs) return track;

  const first: CaptionBlock = { ...block, wordEnd: afterWord, endMs: firstEnd };
  const second: CaptionBlock = {
    ...block,
    id: nextBlockId(track.blocks),
    wordStart: afterWord + 1,
    startMs: secondStart,
  };
  return { ...track, blocks: [...track.blocks.slice(0, blockIndex), first, second, ...track.blocks.slice(blockIndex + 1)] };
}

/** Joins a block with the one after it. */
export function mergeWithNext<T extends Track>(track: T, blockIndex: number): T {
  const block = track.blocks[blockIndex];
  const next = track.blocks[blockIndex + 1];
  if (!block || !next) return track;
  const merged: CaptionBlock = { ...block, wordEnd: next.wordEnd, endMs: next.endMs };
  if (block.realign || next.realign) merged.realign = true;
  return { ...track, blocks: [...track.blocks.slice(0, blockIndex), merged, ...track.blocks.slice(blockIndex + 2)] };
}

/**
 * Moves a block's start or end by `deltaMs`, never into its neighbours, past the
 * video, or below MIN_BLOCK_MS. Word timings are untouched (FR-10).
 */
export function nudgeBlock<T extends Track>(
  track: T,
  blockIndex: number,
  edge: "start" | "end",
  deltaMs: number,
  durationMs: number,
): T {
  const block = track.blocks[blockIndex];
  if (!block || deltaMs === 0) return track;
  const previous = track.blocks[blockIndex - 1];
  const next = track.blocks[blockIndex + 1];

  const current = edge === "start" ? block.startMs : block.endMs;
  const [lower, upper] =
    edge === "start"
      ? [previous ? previous.endMs : 0, block.endMs - MIN_BLOCK_MS]
      : [block.startMs + MIN_BLOCK_MS, next ? next.startMs : durationMs];
  const value = Math.round(Math.max(lower, Math.min(upper, current + deltaMs)));
  // Already at a limit (or a block shorter than the minimum): pressing must never move it the other way.
  if (value === current || Math.sign(value - current) !== Math.sign(deltaMs)) return track;

  const blocks = track.blocks.slice();
  blocks[blockIndex] = edge === "start" ? { ...block, startMs: value } : { ...block, endMs: value };
  return { ...track, blocks };
}

/**
 * Replaces a block's text. Same number of words: only the texts change. A different
 * number: the new words share the block's original span in proportion to their length,
 * and the block is flagged `realign` ("estimated timing — check it").
 */
export function editBlockText<T extends Track>(track: T, blockIndex: number, text: string): T {
  const block = track.blocks[blockIndex];
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!block || tokens.length === 0) return track;
  const count = block.wordEnd - block.wordStart + 1;

  if (tokens.length === count) {
    const words = track.words.slice();
    tokens.forEach((token, offset) => {
      words[block.wordStart + offset] = { ...words[block.wordStart + offset], text: token };
    });
    return { ...track, words };
  }

  const spanStart = track.words[block.wordStart].startMs;
  const spanEnd = track.words[block.wordEnd].endMs;
  const weight = tokens.reduce((sum, token) => sum + token.length + 2, 0);
  let cursor = spanStart;
  const fresh: TranscriptWord[] = tokens.map((token) => {
    const share = ((spanEnd - spanStart) * (token.length + 2)) / weight;
    const startMs = Math.round(cursor);
    const endMs = Math.max(startMs + 1, Math.round(cursor + share - 30));
    cursor += share;
    return { text: token, startMs, endMs };
  });

  const delta = tokens.length - count;
  const words = [...track.words.slice(0, block.wordStart), ...fresh, ...track.words.slice(block.wordEnd + 1)];
  const blocks = track.blocks.map((other, index) =>
    index < blockIndex
      ? other
      : index === blockIndex
        ? { ...other, wordEnd: other.wordEnd + delta, realign: true }
        : { ...other, wordStart: other.wordStart + delta, wordEnd: other.wordEnd + delta },
  );
  return { ...track, words, blocks };
}

/** Lowercase, without accents or punctuation: "Rhythm," and "rhythm" match. */
function wordCore(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export type FindResult =
  | { kind: "empty" }
  | { kind: "multi-word" }
  | { kind: "matches"; wordIndices: number[]; blockCount: number };

/** Whole-word search on the word core, one word at a time (handoff find & replace). */
export function findMatches(track: Track, query: string): FindResult {
  const trimmed = query.trim();
  if (/\s/.test(trimmed)) return { kind: "multi-word" };
  const target = wordCore(trimmed);
  if (!target) return { kind: "empty" };

  const wordIndices = track.words.flatMap((word, index) => (wordCore(word.text) === target ? [index] : []));
  const blockCount = track.blocks.filter((block) =>
    wordIndices.some((index) => index >= block.wordStart && index <= block.wordEnd),
  ).length;
  return { kind: "matches", wordIndices, blockCount };
}

/**
 * Replaces every match, keeping each word's surrounding punctuation and leading
 * capital ("Rhythm," → "Beat,"). Timings are untouched.
 */
export function replaceMatches<T extends Track>(track: T, query: string, replacement: string): { track: T; count: number } {
  const found = findMatches(track, query);
  const value = replacement.trim();
  if (found.kind !== "matches" || found.wordIndices.length === 0 || !value) return { track, count: 0 };

  const words = track.words.slice();
  for (const index of found.wordIndices) {
    const [, before = "", core = "", after = ""] = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(words[index].text) ?? [];
    const capitalized = core.length > 0 && core[0] !== core[0].toLowerCase();
    const text = capitalized && value[0] === value[0].toLowerCase() ? value[0].toUpperCase() + value.slice(1) : value;
    words[index] = { ...words[index], text: before + text + after };
  }
  return { track: { ...track, words }, count: found.wordIndices.length };
}

export type BlockFlag = "estimated timing — check it" | "fast read";

/** Warning shown next to a block's timecode, if any. */
export function blockFlag(track: Track, block: CaptionBlock): BlockFlag | null {
  if (block.realign) return "estimated timing — check it";
  let characters = 0;
  for (let index = block.wordStart; index <= block.wordEnd; index++) characters += track.words[index].text.length + 1;
  const seconds = (block.endMs - block.startMs) / 1000;
  return characters / seconds > FAST_READ_CHARS_PER_SECOND ? "fast read" : null;
}
