import { describe, expect, it } from "vitest";
import { captionFrames, overlayStateKey } from "./caption-timeline";
import { activeBlockIndex, activeWordIndex, type CaptionTrack } from "./captions";
import { POP_TRANSITION_MS } from "./caption-render";
import { PRESETS } from "./style";

/** Two blocks with a gap: [0–1000) "a b", [1500–2400) "c d". */
const track: Pick<CaptionTrack, "words" | "blocks"> = {
  words: [
    { text: "a", startMs: 0, endMs: 400 },
    { text: "b", startMs: 500, endMs: 900 },
    { text: "c", startMs: 1500, endMs: 1900 },
    { text: "d", startMs: 2000, endMs: 2300 },
  ],
  blocks: [
    { id: "b1", wordStart: 0, wordEnd: 1, startMs: 0, endMs: 1000 },
    { id: "b2", wordStart: 2, wordEnd: 3, startMs: 1500, endMs: 2400 },
  ],
};

const durationMs = 3000;
const still = PRESETS.classic.style; // no pop
const pop = PRESETS.bold.style;

/** The frame showing at `timeMs`. */
const at = (frames: ReturnType<typeof captionFrames>, timeMs: number) => frames.filter((frame) => frame.startMs <= timeMs).at(-1)!;

describe("captionFrames", () => {
  it("shows one picture per spoken word and nothing in gaps", () => {
    const frames = captionFrames(track, still, { durationMs });
    expect(frames.map((frame) => [frame.startMs, overlayStateKey(frame.state)])).toEqual([
      [0, "0:0"],
      [500, "0:1"],
      [1000, "empty"],
      [1500, "1:0"],
      [2000, "1:1"],
      [2400, "empty"],
    ]);
  });

  it("agrees with the preview's active block and word at every moment", () => {
    const frames = captionFrames(track, still, { durationMs });
    for (let timeMs = 0; timeMs < durationMs; timeMs += 50) {
      const block = activeBlockIndex(track.blocks, timeMs);
      const state = at(frames, timeMs).state;
      if (block < 0) expect(state).toBeNull();
      else expect(state).toEqual({ blockIndex: block, activeIndex: activeWordIndex(track.words, track.blocks[block], timeMs) });
    }
  });

  it("adds in-between pictures when the spoken word pops, but not when a block appears", () => {
    const frames = captionFrames(track, pop, { durationMs, fps: 30 });
    const popping = frames.filter((frame) => frame.startMs >= 500 && frame.startMs < 1000);
    expect(popping.map((frame) => Math.round(frame.startMs))).toEqual([500, 533, 567, 600, 620]);
    expect(popping[0].state?.transition).toEqual({ previousIndex: 0, eased: 0 });
    expect(popping.at(-1)!.state).toEqual({ blockIndex: 0, activeIndex: 1 });
    expect(at(frames, 1500).state).toEqual({ blockIndex: 1, activeIndex: 0 });
    expect(at(frames, 500 + POP_TRANSITION_MS).state?.transition).toBeUndefined();
  });

  it("cuts a pop short when the next change comes first", () => {
    const fast: typeof track = {
      words: [
        { text: "a", startMs: 0, endMs: 50 },
        { text: "b", startMs: 60, endMs: 100 },
        { text: "c", startMs: 110, endMs: 300 },
      ],
      blocks: [{ id: "b1", wordStart: 0, wordEnd: 2, startMs: 0, endMs: 400 }],
    };
    const frames = captionFrames(fast, pop, { durationMs: 500 });
    const starts = frames.map((frame) => frame.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(frames.filter((frame) => frame.startMs >= 60 && frame.startMs < 110).every((frame) => frame.state?.activeIndex === 1)).toBe(true);
  });

  it("starts empty before the first block and stops at the video's end", () => {
    const late = { ...track, blocks: [{ ...track.blocks[0], startMs: 300 }, track.blocks[1]] };
    const frames = captionFrames(late, still, { durationMs: 1800 });
    expect(frames[0]).toEqual({ startMs: 0, state: null });
    expect(frames[1].startMs).toBe(300);
    expect(frames.every((frame) => frame.startMs < 1800)).toBe(true);
  });
});
