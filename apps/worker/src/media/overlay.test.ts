import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PRESETS, segmentWords } from "@fala/shared";
import { audioTimeoutMs } from "./audio";
import { closeBrowser, renderOverlay } from "./overlay";

afterAll(() => closeBrowser());

/** ~110 words at a natural pace: a few hundred pictures with the Bold preset's pop. */
function sampleTrack(durationMs: number) {
  const words = Array.from({ length: Math.floor(durationMs / 370) }, (_, index) => ({
    text: ["one", "two", "three", "four"][index % 4],
    startMs: index * 370,
    endMs: index * 370 + 320,
  }));
  return { words, blocks: segmentWords(words, { maxWords: 3, durationMs, language: "en" }) };
}

describe("renderOverlay", () => {
  it("draws the same pictures with several pages as with one", { timeout: 120_000 }, async () => {
    const durationMs = 40_000;
    const track = sampleTrack(durationMs);
    const options = { track, style: PRESETS.bold.style, width: 180, height: 320, durationMs };
    const single = await mkdtemp(path.join(os.tmpdir(), "fala-overlay-1-"));
    const parallel = await mkdtemp(path.join(os.tmpdir(), "fala-overlay-4-"));
    try {
      const one = await renderOverlay({ ...options, dir: single, pages: 1 });
      const four = await renderOverlay({ ...options, dir: parallel, pages: 4 });
      expect(four.frameCount).toBe(one.frameCount);
      expect(one.frameCount).toBeGreaterThan(240);
      expect(four.band).toEqual(one.band);
      expect(await readFile(four.listPath, "utf8")).toBe(await readFile(one.listPath, "utf8"));

      const files = (await readdir(single)).filter((file) => file.endsWith(".png")).sort();
      for (const file of files) {
        expect(Buffer.compare(await readFile(path.join(parallel, file)), await readFile(path.join(single, file))), file).toBe(0);
      }
    } finally {
      await rm(single, { recursive: true, force: true });
      await rm(parallel, { recursive: true, force: true });
    }
  });
});

describe("audioTimeoutMs", () => {
  it("grows with long videos and never drops below two minutes", () => {
    expect(audioTimeoutMs(undefined)).toBe(120_000);
    expect(audioTimeoutMs(60_000)).toBe(120_000);
    expect(audioTimeoutMs(30 * 60_000)).toBe(15 * 60_000);
  });
});
