import { describe, expect, it } from "vitest";
import { activeBlockIndex, activeWordIndex, blockText, captionTrackSchema, isNoSpaceLanguage, normalizeWords } from "./captions";

const words = [
  { text: "Hello", startMs: 0, endMs: 300 },
  { text: "world.", startMs: 350, endMs: 700 },
  { text: "Again", startMs: 1200, endMs: 1500 },
];

describe("captionTrackSchema", () => {
  const valid = {
    language: "en",
    words,
    blocks: [
      { id: "b1", wordStart: 0, wordEnd: 1, startMs: 0, endMs: 900 },
      { id: "b2", wordStart: 2, wordEnd: 2, startMs: 1200, endMs: 1700 },
    ],
  };

  it("accepts blocks that cover every word in order", () => {
    expect(captionTrackSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects gaps, overlaps, missing words and inverted times", () => {
    const withBlocks = (blocks: unknown[]) => captionTrackSchema.safeParse({ ...valid, blocks }).success;
    expect(withBlocks([valid.blocks[1]])).toBe(false);
    expect(withBlocks([valid.blocks[0]])).toBe(false);
    expect(withBlocks([valid.blocks[0], { ...valid.blocks[1], wordStart: 1 }])).toBe(false);
    expect(withBlocks([valid.blocks[0], { ...valid.blocks[1], startMs: 800 }])).toBe(false);
    expect(withBlocks([{ ...valid.blocks[0], endMs: 0 }, valid.blocks[1]])).toBe(false);
    expect(withBlocks([valid.blocks[0], { ...valid.blocks[1], wordEnd: 5 }])).toBe(false);
  });

  it("finds the active block from a playback time", () => {
    expect(activeBlockIndex(valid.blocks, 0)).toBe(0);
    expect(activeBlockIndex(valid.blocks, 1000)).toBe(-1);
    expect(activeBlockIndex(valid.blocks, 1699)).toBe(1);
    expect(activeBlockIndex(valid.blocks, 1700)).toBe(-1);
  });

  it("derives block text from its words", () => {
    expect(blockText(valid, valid.blocks[0])).toBe("Hello world.");
  });
});

describe("normalizeWords", () => {
  it("drops empty tokens, sorts, rounds and keeps words inside the video", () => {
    expect(
      normalizeWords(
        [
          { text: "late", startMs: 900.4, endMs: 2000 },
          { text: "  ", startMs: 10, endMs: 20 },
          { text: " early ", startMs: 0.6, endMs: 0.6, confidence: 1.4 },
        ],
        1000,
      ),
    ).toEqual([
      { text: "early", startMs: 1, endMs: 2, confidence: 1 },
      { text: "late", startMs: 900, endMs: 1000 },
    ]);
  });

  it("gives words that start at the very end a minimal duration", () => {
    expect(normalizeWords([{ text: "x", startMs: 5000, endMs: 5000 }], 1000)).toEqual([
      { text: "x", startMs: 999, endMs: 1000 },
    ]);
  });
});

describe("isNoSpaceLanguage", () => {
  it("recognizes language codes with regions", () => {
    expect(isNoSpaceLanguage("ja")).toBe(true);
    expect(isNoSpaceLanguage("zh-TW")).toBe(true);
    expect(isNoSpaceLanguage("pt")).toBe(false);
    expect(isNoSpaceLanguage(null)).toBe(false);
  });
});

describe("activeWordIndex", () => {
  const block = { id: "b1", wordStart: 0, wordEnd: 1, startMs: 0, endMs: 900 };

  it("is the last word of the block that has started", () => {
    expect(activeWordIndex(words, block, 0)).toBe(0);
    expect(activeWordIndex(words, block, 320)).toBe(0);
    expect(activeWordIndex(words, block, 350)).toBe(1);
    expect(activeWordIndex(words, block, 899)).toBe(1);
  });

  it("is relative to the block and -1 before its first word", () => {
    const second = { id: "b2", wordStart: 2, wordEnd: 2, startMs: 1100, endMs: 1700 };
    expect(activeWordIndex(words, second, 1150)).toBe(-1);
    expect(activeWordIndex(words, second, 1200)).toBe(0);
  });
});
