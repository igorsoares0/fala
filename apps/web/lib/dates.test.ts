import { describe, expect, it } from "vitest";
import { formatExportDate, formatProjectDate } from "./dates";

describe("formatProjectDate", () => {
  const now = new Date(2026, 9, 14, 15, 30);

  it("shows the time for today", () => {
    expect(formatProjectDate(new Date(2026, 9, 14, 10, 12), now)).toBe("today, 10:12");
  });

  it("says yesterday for the previous calendar day", () => {
    expect(formatProjectDate(new Date(2026, 9, 13, 23, 59), now)).toBe("yesterday");
  });

  it("shows month and day for older dates", () => {
    expect(formatProjectDate(new Date(2026, 9, 12, 9, 0), now)).toBe("Oct 12");
  });
});

describe("formatExportDate", () => {
  const now = new Date(2026, 9, 14, 15, 30);

  it("keeps the time for yesterday, like the handoff's version list", () => {
    expect(formatExportDate(new Date(2026, 9, 13, 18, 42), now)).toBe("yesterday, 18:42");
    expect(formatExportDate(new Date(2026, 9, 14, 9, 5), now)).toBe("today, 09:05");
    expect(formatExportDate(new Date(2026, 9, 12, 9, 0), now)).toBe("Oct 12");
  });
});
