import { describe, expect, it } from "vitest";
import {
  blockFlag,
  editBlockText,
  findMatches,
  mergeWithNext,
  nextBlockId,
  nudgeBlock,
  replaceMatches,
  splitBlock,
} from "./caption-edits";
import { blockText, captionTrackSchema, type CaptionTrack } from "./captions";

/** "It's the rhythm, | that keeps you | watching." — words 200 ms long, 50 ms apart. */
function sampleTrack(language: string | null = "en"): CaptionTrack {
  const texts = ["It's", "the", "Rhythm,", "that", "keeps", "you", "watching."];
  const words = texts.map((text, index) => ({ text, startMs: index * 250, endMs: index * 250 + 200 }));
  return {
    language,
    words,
    blocks: [
      { id: "b1", wordStart: 0, wordEnd: 2, startMs: 0, endMs: 700 },
      { id: "b2", wordStart: 3, wordEnd: 5, startMs: 750, endMs: 1450 },
      { id: "b3", wordStart: 6, wordEnd: 6, startMs: 1500, endMs: 1920 },
    ],
  };
}

const DURATION = 2000;
const valid = (track: CaptionTrack) => expect(captionTrackSchema.safeParse(track).success).toBe(true);
const texts = (track: CaptionTrack) => track.blocks.map((block) => blockText(track, block));

describe("splitBlock / mergeWithNext", () => {
  it("splits between two words and merges back", () => {
    const track = sampleTrack();
    const split = splitBlock(track, 0, 0);
    valid(split);
    expect(texts(split)).toEqual(["It's", "the Rhythm,", "that keeps you", "watching."]);
    expect(split.blocks[0]).toMatchObject({ id: "b1", endMs: 200 + 50 });
    expect(split.blocks[1]).toMatchObject({ id: "b4", startMs: 250, endMs: 700 });

    const merged = mergeWithNext(split, 0);
    valid(merged);
    expect(texts(merged)).toEqual(texts(track));
  });

  it("ignores splits outside the block and merging the last block", () => {
    const track = sampleTrack();
    expect(splitBlock(track, 0, 2)).toBe(track);
    expect(splitBlock(track, 2, 6)).toBe(track);
    expect(mergeWithNext(track, 2)).toBe(track);
  });

  it("keeps the review flag when merging", () => {
    const flagged = { ...sampleTrack(), blocks: sampleTrack().blocks.map((b, i) => (i === 1 ? { ...b, realign: true } : b)) };
    expect(mergeWithNext(flagged, 0).blocks[0].realign).toBe(true);
  });

  it("generates ids that don't collide", () => {
    expect(nextBlockId([{ id: "b9" }, { id: "b2" }, { id: "custom" }] as never)).toBe("b10");
  });
});

describe("nudgeBlock", () => {
  it("moves a block edge by 100 ms", () => {
    const track = sampleTrack();
    expect(nudgeBlock(track, 1, "start", 100, DURATION).blocks[1].startMs).toBe(850);
    expect(nudgeBlock(track, 1, "end", -100, DURATION).blocks[1].endMs).toBe(1350);
  });

  it("never overlaps neighbours, leaves the video or gets shorter than 300 ms", () => {
    const track = sampleTrack();
    expect(nudgeBlock(track, 1, "start", -100, DURATION).blocks[1].startMs).toBe(700);
    expect(nudgeBlock(track, 0, "start", -100, DURATION)).toBe(track);
    expect(nudgeBlock(track, 2, "end", 100, DURATION).blocks[2].endMs).toBe(2000);
    expect(nudgeBlock(track, 2, "end", -100, DURATION).blocks[2].endMs).toBe(1820);
    const short = nudgeBlock(nudgeBlock(track, 2, "end", -100, DURATION), 2, "end", -100, DURATION);
    expect(short.blocks[2].endMs).toBe(1800);
    expect(nudgeBlock(short, 2, "end", -100, DURATION)).toBe(short);
    valid(short);
  });
});

describe("editBlockText", () => {
  it("keeps timings when the word count is the same", () => {
    const track = sampleTrack();
    const edited = editBlockText(track, 1, "  that holds   you ");
    valid(edited);
    expect(texts(edited)[1]).toBe("that holds you");
    expect(edited.words.map((w) => [w.startMs, w.endMs])).toEqual(track.words.map((w) => [w.startMs, w.endMs]));
    expect(edited.blocks[1].realign).toBeUndefined();
  });

  it("spreads new words over the block's span and flags it when the count changes", () => {
    const track = sampleTrack();
    const more = editBlockText(track, 1, "that really keeps all of you");
    valid(more);
    expect(texts(more)).toEqual(["It's the Rhythm,", "that really keeps all of you", "watching."]);
    expect(more.blocks[1].realign).toBe(true);
    const span = more.words.slice(more.blocks[1].wordStart, more.blocks[1].wordEnd + 1);
    expect(span[0].startMs).toBe(750);
    expect(span.at(-1)!.endMs).toBeLessThanOrEqual(1450);
    expect(more.blocks[2]).toMatchObject({ wordStart: 9, wordEnd: 9 });

    const fewer = editBlockText(track, 0, "Rhythm");
    valid(fewer);
    expect(texts(fewer)).toEqual(["Rhythm", "that keeps you", "watching."]);
  });

  it("ignores empty text", () => {
    const track = sampleTrack();
    expect(editBlockText(track, 0, "   ")).toBe(track);
  });
});

describe("find and replace", () => {
  it("matches whole words ignoring case, accents and punctuation, one word at a time", () => {
    const track = sampleTrack();
    expect(findMatches(track, "rhythm")).toEqual({ kind: "matches", wordIndices: [2], blockCount: 1 });
    expect(findMatches(track, "RHYTHM!")).toMatchObject({ wordIndices: [2] });
    expect(findMatches(track, "rhy")).toMatchObject({ wordIndices: [] });
    expect(findMatches(track, "keeps you")).toEqual({ kind: "multi-word" });
    expect(findMatches(track, "  ")).toEqual({ kind: "empty" });
    const accented = { ...track, words: track.words.map((w, i) => (i === 3 ? { ...w, text: "Café" } : w)) };
    expect(findMatches(accented, "cafe")).toMatchObject({ wordIndices: [3] });
  });

  it("keeps punctuation, the leading capital and every timing", () => {
    const track = sampleTrack();
    const { track: replaced, count } = replaceMatches(track, "rhythm", "beat");
    valid(replaced);
    expect(count).toBe(1);
    expect(replaced.words[2]).toEqual({ ...track.words[2], text: "Beat," });
    expect(replaceMatches(track, "nothing", "x").count).toBe(0);
    expect(replaceMatches(track, "rhythm", "  ").count).toBe(0);
  });
});

describe("blockFlag", () => {
  it("flags estimated timing first, then fast reading", () => {
    const track = sampleTrack();
    // 17 characters in 1 s reads comfortably.
    expect(blockFlag(track, { ...track.blocks[0], endMs: 1000 })).toBeNull();
    expect(blockFlag(track, { ...track.blocks[0], endMs: 1000, realign: true })).toBe("estimated timing — check it");
    // 17 characters in 0.5 s = 34 chars/s.
    expect(blockFlag(track, { ...track.blocks[0], endMs: 500 })).toBe("fast read");
  });
});
