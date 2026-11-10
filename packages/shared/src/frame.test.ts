import { describe, expect, it } from "vitest";
import { cropAxis, cropRect, FRAME_ASPECTS, frameSchema, isTallFrame, normalizeFrame, ORIGINAL_FRAME, type Frame } from "./frame";

const frame = (aspect: Frame["aspect"], focus = 0.5): Frame => ({ aspect, focus });

describe("frame", () => {
  it("keeps the whole source for the original frame", () => {
    expect(cropAxis(1920, 1080, ORIGINAL_FRAME)).toBeNull();
    expect(cropRect(1920, 1080, ORIGINAL_FRAME)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("cuts the sides of a landscape video for 9:16, placed by the focus", () => {
    expect(cropAxis(1920, 1080, frame("9:16"))).toBe("x");
    // 1080 × 9/16 = 607.5 → 606, the even size that fits.
    expect(cropRect(1920, 1080, frame("9:16", 0))).toEqual({ x: 0, y: 0, width: 606, height: 1080 });
    expect(cropRect(1920, 1080, frame("9:16", 0.5))).toEqual({ x: 656, y: 0, width: 606, height: 1080 });
    expect(cropRect(1920, 1080, frame("9:16", 1))).toEqual({ x: 1314, y: 0, width: 606, height: 1080 });
  });

  it("cuts the top and bottom of a portrait video for 16:9", () => {
    expect(cropAxis(1080, 1920, frame("16:9"))).toBe("y");
    expect(cropRect(1080, 1920, frame("16:9", 0))).toEqual({ x: 0, y: 0, width: 1080, height: 606 });
    expect(cropRect(1080, 1920, frame("16:9", 1))).toEqual({ x: 0, y: 1314, width: 1080, height: 606 });
  });

  it("doesn't crop a source that already has the ratio, give or take encoder rounding", () => {
    expect(cropAxis(1080, 1920, frame("9:16"))).toBeNull();
    expect(cropRect(1080, 1920, frame("9:16", 0))).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect(cropAxis(1088, 1920, frame("9:16"))).toBeNull();
    expect(cropAxis(1920, 1080, frame("16:9"))).toBeNull();
    expect(cropAxis(720, 720, frame("1:1"))).toBeNull();
  });

  it("always stays inside the source, with an even cut side and offset", () => {
    const sources = [
      [1920, 1080],
      [1080, 1920],
      [640, 360],
      [361, 641],
      [1280, 720],
      [3, 2000],
    ];
    for (const [width, height] of sources) {
      for (const aspect of FRAME_ASPECTS) {
        for (const focus of [0, 0.33, 0.5, 1]) {
          const candidate = frame(aspect, focus);
          const rect = cropRect(width, height, candidate);
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.width).toBeLessThanOrEqual(width);
          expect(rect.y + rect.height).toBeLessThanOrEqual(height);
          const axis = cropAxis(width, height, candidate);
          if (axis === "x") expect([rect.x % 2, rect.width % 2, rect.height]).toEqual([0, 0, height]);
          if (axis === "y") expect([rect.y % 2, rect.height % 2, rect.width]).toEqual([0, 0, width]);
        }
      }
    }
  });

  it("gets the ratio it asked for", () => {
    const square = cropRect(1920, 1080, frame("1:1"));
    expect(square.width).toBe(square.height);
    const feed = cropRect(1920, 1080, frame("4:5"));
    expect(feed.width / feed.height).toBeCloseTo(4 / 5, 2);
  });

  it("stores the original without a focus, and a focus as a whole percent", () => {
    expect(normalizeFrame({ aspect: "original", focus: 0.9 })).toEqual(ORIGINAL_FRAME);
    expect(normalizeFrame({ aspect: "9:16", focus: 0.3333 })).toEqual({ aspect: "9:16", focus: 0.33 });
    expect(frameSchema.safeParse({ aspect: "9:16", focus: 1.2 }).success).toBe(false);
    expect(frameSchema.safeParse({ aspect: "3:2", focus: 0.5 }).success).toBe(false);
  });

  it("calls full-screen vertical video tall, but not a 4:5 feed post", () => {
    expect(isTallFrame(1080, 1920)).toBe(true);
    expect(isTallFrame(606, 1080)).toBe(true);
    expect(isTallFrame(1080, 1350)).toBe(false);
    expect(isTallFrame(1080, 1080)).toBe(false);
    expect(isTallFrame(1920, 1080)).toBe(false);
  });
});
