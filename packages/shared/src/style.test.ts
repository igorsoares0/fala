import { describe, expect, it } from "vitest";
import { PRESETS, PRESET_KEYS, captionStyleSchema, contrastTextColor } from "./style";

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
