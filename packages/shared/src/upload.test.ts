import { describe, expect, it } from "vitest";
import { formatBytes, mimeTypeForFile, presignRequestSchema, UPLOAD_LIMITS, uploadPartPlan } from "./upload";

describe("mimeTypeForFile", () => {
  it("trusts a known extension over an empty or vague browser type", () => {
    expect(mimeTypeForFile("clip.MOV", "")).toBe("video/quicktime");
    expect(mimeTypeForFile("clip.mp4", "application/octet-stream")).toBe("video/mp4");
    expect(mimeTypeForFile("clip.webm", "video/webm")).toBe("video/webm");
  });

  it("falls back to the browser type when the extension is unknown", () => {
    expect(mimeTypeForFile("clip", "video/mp4")).toBe("video/mp4");
  });

  it("rejects other formats", () => {
    expect(mimeTypeForFile("clip.avi", "video/x-msvideo")).toBeNull();
    expect(mimeTypeForFile("notes.txt", "text/plain")).toBeNull();
  });
});

describe("presignRequestSchema", () => {
  it("accepts a supported file within the size limit", () => {
    expect(presignRequestSchema.safeParse({ mimeType: "video/mp4", sizeBytes: 1000 }).success).toBe(true);
  });

  it("rejects files over the limit, empty files and unsupported types", () => {
    expect(presignRequestSchema.safeParse({ mimeType: "video/mp4", sizeBytes: UPLOAD_LIMITS.maxBytes + 1 }).success).toBe(false);
    expect(presignRequestSchema.safeParse({ mimeType: "video/mp4", sizeBytes: 0 }).success).toBe(false);
    expect(presignRequestSchema.safeParse({ mimeType: "video/avi", sizeBytes: 10 }).success).toBe(false);
  });
});

describe("formatBytes", () => {
  it("uses the largest whole unit", () => {
    expect(formatBytes(UPLOAD_LIMITS.maxBytes)).toBe("4 GB");
    expect(formatBytes(240 * 1024 * 1024)).toBe("240 MB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12)).toBe("12 B");
  });
});

describe("uploadPartPlan", () => {
  const MB = 1024 * 1024;

  it("sends small files as a single part", () => {
    expect(uploadPartPlan(66_000)).toEqual({ partSize: 16 * MB, partCount: 1 });
  });

  it("splits large files into 16 MB parts, and grows parts to stay within 1,000", () => {
    expect(uploadPartPlan(100 * MB)).toEqual({ partSize: 16 * MB, partCount: 7 });
    const huge = uploadPartPlan(UPLOAD_LIMITS.maxBytes);
    expect(huge.partCount).toBeLessThanOrEqual(1_000);
    expect(huge.partSize * huge.partCount).toBeGreaterThanOrEqual(UPLOAD_LIMITS.maxBytes);
  });

  it("never goes below the 5 MB S3 minimum, even when a test asks for smaller parts", () => {
    expect(uploadPartPlan(12 * MB, 1 * MB)).toEqual({ partSize: 5 * MB, partCount: 3 });
  });
});
