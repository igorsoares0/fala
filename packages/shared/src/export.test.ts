import { describe, expect, it } from "vitest";
import { exportDimensions, exportErrorFor, exportErrorRef, exportFileName } from "./export";

describe("exportDimensions", () => {
  it("sets the short side to the target, keeping the aspect ratio", () => {
    expect(exportDimensions(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
    expect(exportDimensions(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("never upscales", () => {
    expect(exportDimensions(720, 1280, 1080)).toEqual({ width: 720, height: 1280 });
    expect(exportDimensions(480, 854, 720)).toEqual({ width: 480, height: 854 });
  });

  it("keeps both sides even", () => {
    expect(exportDimensions(1081, 1921, 1080)).toEqual({ width: 1080, height: 1920 });
    expect(exportDimensions(719, 1279, 720)).toEqual({ width: 720, height: 1280 });
  });
});

describe("export names and errors", () => {
  it("builds a readable, safe file name", () => {
    expect(exportFileName("My trip to Lisboa!", 2)).toBe("my-trip-to-lisboa_v2.mp4");
    expect(exportFileName("Café São Paulo", 1)).toBe("cafe-sao-paulo_v1.mp4");
    expect(exportFileName("東京の夜", 3)).toBe("東京の夜_v3.mp4");
    expect(exportFileName("../../etc", 1)).toBe("etc_v1.mp4");
    expect(exportFileName("!!!", 1)).toBe("video_v1.mp4");
  });

  it("maps unknown codes to the generic failure and gives a short reference", () => {
    expect(exportErrorFor("NOPE")).toBe(exportErrorFor("RENDER_FAILED"));
    expect(exportErrorRef("cmh8f2k41abc")).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{2}$/);
  });
});
