import { describe, expect, it } from "vitest";
import { jobPayloadSchemas } from "./jobs";
import { PROJECT_ERROR_CODES, PROJECT_ERRORS, projectErrorFor } from "./project-errors";

describe("project errors", () => {
  it("has copy for every code", () => {
    for (const code of PROJECT_ERROR_CODES) {
      expect(PROJECT_ERRORS[code].title.length).toBeGreaterThan(0);
      expect(PROJECT_ERRORS[code].body.length).toBeGreaterThan(0);
    }
  });

  it("states the limits in the copy", () => {
    expect(PROJECT_ERRORS.FILE_TOO_LARGE.body).toContain("1 GB");
    expect(PROJECT_ERRORS.VIDEO_TOO_LONG.body).toContain("3 minutes");
  });

  it("falls back to the generic server error for unknown codes", () => {
    expect(projectErrorFor("SOMETHING_ELSE")).toBe(PROJECT_ERRORS.PROCESSING_FAILED);
    expect(projectErrorFor(null)).toBe(PROJECT_ERRORS.PROCESSING_FAILED);
    expect(projectErrorFor("NO_AUDIO")).toBe(PROJECT_ERRORS.NO_AUDIO);
  });
});

describe("job payloads", () => {
  it("validates each job type's payload", () => {
    expect(jobPayloadSchemas.VALIDATE_VIDEO.safeParse({ projectId: "p", sourceObjectKey: "k" }).success).toBe(true);
    expect(jobPayloadSchemas.VALIDATE_VIDEO.safeParse({ projectId: "p" }).success).toBe(false);
    expect(jobPayloadSchemas.DELETE_PROJECT_ASSETS.safeParse({ projectId: "p", userId: "u" }).success).toBe(true);
  });
});
