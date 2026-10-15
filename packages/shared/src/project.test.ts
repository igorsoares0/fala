import { describe, expect, it } from "vitest";
import { PROJECT_NAME_MAX_LENGTH, defaultProjectName, projectNameSchema } from "./project";

describe("defaultProjectName", () => {
  it("strips the extension", () => {
    expect(defaultProjectName("Interview take 2.mp4")).toBe("Interview take 2");
  });

  it("drops directories and normalizes separators and whitespace", () => {
    expect(defaultProjectName("C:\\clips\\my_podcast__ep 4.MOV")).toBe("my podcast ep 4");
    expect(defaultProjectName("/tmp/  launch   teaser .webm")).toBe("launch teaser");
  });

  it("keeps dots that are not an extension", () => {
    expect(defaultProjectName("v1.2 final cut.mp4")).toBe("v1.2 final cut");
  });

  it("falls back when nothing readable is left", () => {
    expect(defaultProjectName(".mp4")).toBe("Untitled video");
    expect(defaultProjectName("   ")).toBe("Untitled video");
  });

  it("caps the length", () => {
    const long = `${"a".repeat(300)}.mp4`;
    expect(defaultProjectName(long)).toHaveLength(PROJECT_NAME_MAX_LENGTH);
  });
});

describe("projectNameSchema", () => {
  it("trims and collapses whitespace", () => {
    expect(projectNameSchema.parse("  Morning   vlog ")).toBe("Morning vlog");
  });

  it("rejects empty and overly long names", () => {
    expect(projectNameSchema.safeParse("   ").success).toBe(false);
    expect(projectNameSchema.safeParse("a".repeat(PROJECT_NAME_MAX_LENGTH + 1)).success).toBe(false);
  });
});
