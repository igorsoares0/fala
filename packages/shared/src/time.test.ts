import { describe, expect, it } from "vitest";
import { formatDuration, formatTimecode, msSchema } from "./time";

describe("formatTimecode", () => {
  it("formats minutes, seconds and tenths", () => {
    expect(formatTimecode(0)).toBe("00:00.0");
    expect(formatTimecode(3240)).toBe("00:03.2");
    expect(formatTimecode(5199)).toBe("00:05.1");
    expect(formatTimecode(65_400)).toBe("01:05.4");
  });

  it("clamps negative values to zero", () => {
    expect(formatTimecode(-500)).toBe("00:00.0");
  });
});

describe("formatDuration", () => {
  it("rounds to whole seconds", () => {
    expect(formatDuration(22_700)).toBe("0:23");
    expect(formatDuration(180_000)).toBe("3:00");
  });
});

describe("msSchema", () => {
  it("accepts non-negative integers only", () => {
    expect(msSchema.safeParse(0).success).toBe(true);
    expect(msSchema.safeParse(1200).success).toBe(true);
    expect(msSchema.safeParse(-1).success).toBe(false);
    expect(msSchema.safeParse(1.5).success).toBe(false);
  });
});
