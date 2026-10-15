import { describe, expect, it } from "vitest";
import { projectPrefix, sourceKey, thumbnailKey, uploadIdFromSourceKey } from "./storage-keys";

describe("storage keys", () => {
  it("nests every object under the owner's project prefix", () => {
    expect(projectPrefix("u1", "p1")).toBe("users/u1/projects/p1/");
    expect(sourceKey("u1", "p1", "up1", "mp4")).toBe("users/u1/projects/p1/source/up1.mp4");
    expect(thumbnailKey("u1", "p1", "up1")).toBe("users/u1/projects/p1/thumbnails/up1.jpg");
  });

  it("refuses ids that could escape the prefix", () => {
    expect(() => projectPrefix("../u2", "p1")).toThrow();
    expect(() => sourceKey("u1", "p1", "a/b", "mp4")).toThrow();
    expect(() => sourceKey("u1", "p1", "up1", "mp4/../x")).toThrow();
  });

  it("recovers the upload id from a source key", () => {
    expect(uploadIdFromSourceKey(sourceKey("u1", "p1", "up1", "mov"))).toBe("up1");
    expect(uploadIdFromSourceKey("users/u1/projects/p1/thumbnails/up1.jpg")).toBeNull();
  });
});
