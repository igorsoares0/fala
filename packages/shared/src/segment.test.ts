import { describe, expect, it } from "vitest";
import { blockText, captionTrackSchema, type TranscriptWord } from "./captions";
import { BLOCK_END_PADDING_MS, segmentWords } from "./segment";

/** Words spoken back to back: each 200ms long with a 50ms gap, unless a pause is marked with "|". */
function speak(script: string, { startMs = 0, pauseMs = 500 } = {}): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let t = startMs;
  for (const token of script.split(" ")) {
    if (token === "|") {
      t += pauseMs;
      continue;
    }
    words.push({ text: token, startMs: t, endMs: t + 200 });
    t += 250;
  }
  return words;
}

function texts(words: TranscriptWord[], maxWords: number, language: string | null = "en", durationMs = 60_000) {
  const blocks = segmentWords(words, { maxWords, durationMs, language });
  // Every segmentation must be a valid caption track.
  expect(captionTrackSchema.safeParse({ language, words, blocks }).success).toBe(true);
  return blocks.map((block) => blockText({ words, language }, block));
}

describe("segmentWords", () => {
  it("breaks after sentence punctuation", () => {
    expect(texts(speak("Hi there. How are you?"), 5)).toEqual(["Hi there.", "How are you?"]);
  });

  it("breaks after a comma once the block has two words", () => {
    expect(texts(speak("Well, if you ask me, it works"), 6)).toEqual(["Well, if you ask me,", "it works"]);
  });

  it("breaks on pauses longer than 300ms", () => {
    expect(texts(speak("so we went | to the beach"), 6)).toEqual(["so we went", "to the beach"]);
  });

  it("caps blocks at maxWords", () => {
    expect(texts(speak("one two three four five six seven eight nine ten"), 3)).toEqual([
      "one two three",
      "four five six",
      "seven eight nine ten",
    ]);
  });

  it("does not leave a single word alone before a sentence ends", () => {
    expect(texts(speak("it was the best day."), 2)).toEqual(["it was", "the best day."]);
    expect(texts(speak("this is it. Next"), 2)).toEqual(["this is it.", "Next"]);
  });

  it("splits long words by characters even under maxWords", () => {
    const words = speak("internationalization responsibilities extraordinarily");
    // 37 characters fit in one block; a third word would pass the 42-character limit.
    expect(texts(words, 10)).toEqual(["internationalization responsibilities", "extraordinarily"]);
  });

  it("joins words without spaces for languages written that way and limits characters", () => {
    const words = speak("今日 は とても いい 天気 です ね");
    const result = texts(words, 10, "ja");
    expect(result.join("")).toBe("今日はとてもいい天気ですね");
    expect(result.every((text) => text.length <= 14)).toBe(true);
    expect(texts(speak("你好 世界。 再见"), 5, "zh")).toEqual(["你好世界。", "再见"]);
  });

  it("keeps blocks on screen a little after the last word, until the next block starts", () => {
    const words = speak("first block. | second block.");
    const blocks = segmentWords(words, { maxWords: 5, durationMs: 60_000 });
    expect(blocks[0].endMs).toBe(words[1].endMs + BLOCK_END_PADDING_MS);
    expect(blocks[1].startMs).toBe(words[2].startMs);

    const tight = speak("a. b.");
    const tightBlocks = segmentWords(tight, { maxWords: 5, durationMs: 60_000 });
    expect(tightBlocks[0].endMs).toBe(tight[1].startMs);
  });

  it("never ends a block after the video", () => {
    const words = speak("last words");
    const blocks = segmentWords(words, { maxWords: 5, durationMs: 460 });
    expect(blocks.at(-1)!.endMs).toBe(460);
  });

  it("stays valid when provider timings overlap", () => {
    const words: TranscriptWord[] = [
      { text: "a", startMs: 100, endMs: 400 },
      { text: "b.", startMs: 100, endMs: 300 },
      { text: "c", startMs: 100, endMs: 101 },
    ];
    expect(texts(words, 1)).toEqual(["a", "b.", "c"]);
  });

  it("returns no blocks for no words", () => {
    expect(segmentWords([], { maxWords: 3, durationMs: 1000 })).toEqual([]);
  });
});
