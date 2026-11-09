import { describe, expect, it } from "vitest";
import { clampTrim, fullTrim, isTrimmed, MIN_TRIM_MS, moveTrimEdge, overlapsTrim, trimLengthMs, trimSchema } from "./trim";

const durationMs = 10_000;

describe("trim", () => {
  it("starts as the whole video, which isn't a trim", () => {
    const trim = fullTrim(durationMs);
    expect(trim).toEqual({ startMs: 0, endMs: durationMs });
    expect(isTrimmed(trim, durationMs)).toBe(false);
    expect(isTrimmed({ startMs: 1, endMs: durationMs }, durationMs)).toBe(true);
    expect(isTrimmed({ startMs: 0, endMs: durationMs - 1 }, durationMs)).toBe(true);
    expect(trimLengthMs({ startMs: 2000, endMs: 7500 })).toBe(5500);
  });

  it("only accepts whole ms with the end after the start", () => {
    expect(trimSchema.safeParse({ startMs: 0, endMs: 1000 }).success).toBe(true);
    expect(trimSchema.safeParse({ startMs: 1000, endMs: 1000 }).success).toBe(false);
    expect(trimSchema.safeParse({ startMs: -1, endMs: 1000 }).success).toBe(false);
    expect(trimSchema.safeParse({ startMs: 0.5, endMs: 1000 }).success).toBe(false);
  });

  it("clamps a stored trim into the video and to the minimum length", () => {
    expect(clampTrim({ startMs: 2000, endMs: 7000 }, durationMs)).toEqual({ startMs: 2000, endMs: 7000 });
    expect(clampTrim({ startMs: 2000.4, endMs: 99_000 }, durationMs)).toEqual({ startMs: 2000, endMs: durationMs });
    // Too short: the start gives way.
    expect(clampTrim({ startMs: 9800, endMs: 9900 }, durationMs)).toEqual({ startMs: 9900 - MIN_TRIM_MS, endMs: 9900 });
    // Too short at the very beginning: the end moves out instead.
    expect(clampTrim({ startMs: 0, endMs: 200 }, durationMs)).toEqual({ startMs: 0, endMs: MIN_TRIM_MS });
  });

  it("keeps a video shorter than the minimum whole", () => {
    expect(clampTrim({ startMs: 100, endMs: 300 }, 600)).toEqual({ startMs: 0, endMs: 600 });
    expect(moveTrimEdge(fullTrim(600), "start", 300, 600)).toEqual(fullTrim(600));
  });

  it("moves one edge without crossing the other or leaving the video", () => {
    const trim = { startMs: 2000, endMs: 7000 };
    expect(moveTrimEdge(trim, "start", 3000.4, durationMs)).toEqual({ startMs: 3000, endMs: 7000 });
    expect(moveTrimEdge(trim, "start", -500, durationMs)).toEqual({ startMs: 0, endMs: 7000 });
    expect(moveTrimEdge(trim, "start", 6900, durationMs)).toEqual({ startMs: 7000 - MIN_TRIM_MS, endMs: 7000 });
    expect(moveTrimEdge(trim, "end", 99_000, durationMs)).toEqual({ startMs: 2000, endMs: durationMs });
    expect(moveTrimEdge(trim, "end", 2100, durationMs)).toEqual({ startMs: 2000, endMs: 2000 + MIN_TRIM_MS });
  });

  it("returns the same object when the edge doesn't move, so it records no undo step", () => {
    const trim = { startMs: 0, endMs: durationMs };
    expect(moveTrimEdge(trim, "start", -10, durationMs)).toBe(trim);
    expect(moveTrimEdge(trim, "end", durationMs + 10, durationMs)).toBe(trim);
  });

  it("tells which captions play inside the kept range", () => {
    const trim = { startMs: 2000, endMs: 7000 };
    expect(overlapsTrim({ startMs: 500, endMs: 2000 }, trim)).toBe(false);
    expect(overlapsTrim({ startMs: 1500, endMs: 2100 }, trim)).toBe(true);
    expect(overlapsTrim({ startMs: 6900, endMs: 8000 }, trim)).toBe(true);
    expect(overlapsTrim({ startMs: 7000, endMs: 8000 }, trim)).toBe(false);
  });
});
