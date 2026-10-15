import { describe, expect, it } from "vitest";
import {
  HIGHLIGHT_COLORS,
  PRESETS,
  PRESET_KEYS,
  TEXT_COLORS,
  captionStyleSchema,
  contrastTextColor,
  isPresetModified,
  projectStyleInputSchema,
} from "./style";

describe("PRESETS", () => {
  it.each(PRESET_KEYS)("%s is a valid caption style", (key) => {
    expect(captionStyleSchema.safeParse(PRESETS[key].style).success).toBe(true);
    expect(PRESETS[key].key).toBe(key);
  });
});

describe("captionStyleSchema", () => {
  it("rejects out-of-range values", () => {
    const base = PRESETS.bold.style;
    expect(captionStyleSchema.safeParse({ ...base, size: 80 }).success).toBe(false);
    expect(captionStyleSchema.safeParse({ ...base, maxW: 0 }).success).toBe(false);
    expect(captionStyleSchema.safeParse({ ...base, color: "red" }).success).toBe(false);
  });
});

describe("contrastTextColor", () => {
  it("uses dark text on light highlights and light text on dark ones", () => {
    expect(contrastTextColor("#ffd400")).toBe("#111111");
    expect(contrastTextColor("#ffffff")).toBe("#111111");
    expect(contrastTextColor("#ff5a1f")).toBe("#ffffff");
    expect(contrastTextColor("#111111")).toBe("#ffffff");
  });
});

describe("style panel helpers", () => {
  it("offers only colors the style contract accepts", () => {
    for (const { value } of [...TEXT_COLORS, ...HIGHLIGHT_COLORS]) {
      expect(captionStyleSchema.safeParse({ ...PRESETS.bold.style, color: value, hl: value }).success).toBe(true);
    }
  });

  it("knows when a style was adjusted away from its preset", () => {
    expect(isPresetModified("bold", PRESETS.bold.style)).toBe(false);
    expect(isPresetModified("bold", { ...PRESETS.bold.style, size: 40 })).toBe(true);
    expect(isPresetModified("word", PRESETS.bold.style)).toBe(true);
  });

  it("validates a project style input", () => {
    expect(projectStyleInputSchema.safeParse({ presetKey: "podcast", style: PRESETS.podcast.style }).success).toBe(true);
    expect(projectStyleInputSchema.safeParse({ presetKey: "nope", style: PRESETS.podcast.style }).success).toBe(false);
  });
});
