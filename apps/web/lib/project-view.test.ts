import { describe, expect, it } from "vitest";
import { chipStatus, needsPolling, projectView } from "./project-view";

describe("projectView", () => {
  it("shows upload progress as the first 40% while this tab is sending", () => {
    expect(projectView("UPLOADING", { phase: "uploading", progress: 0.5 })).toEqual({
      kind: "processing",
      stage: "upload",
      percent: 20,
    });
    expect(projectView("UPLOADING", { phase: "confirming", progress: 1 })).toMatchObject({ percent: 40 });
  });

  it("keeps the local view until the server reports the confirmed upload", () => {
    expect(projectView("UPLOADING", { phase: "confirmed", progress: 1 })).toMatchObject({ stage: "upload" });
    expect(projectView("UPLOADED", { phase: "confirmed", progress: 1 })).toEqual({
      kind: "processing",
      stage: "validate",
      percent: 45,
    });
    expect(projectView("READY", { phase: "confirmed", progress: 1 })).toEqual({ kind: "settled" });
  });

  it("prefers a retry in progress over the server's earlier failure", () => {
    expect(projectView("FAILED", { phase: "uploading", progress: 0 })).toMatchObject({ stage: "upload" });
    expect(projectView("FAILED", undefined)).toEqual({ kind: "failed" });
  });

  it("reports local upload failures and uploads interrupted by a reload", () => {
    expect(projectView("UPLOADING", { phase: "failed", progress: 0, error: "Offline" })).toEqual({
      kind: "upload-failed",
      error: "Offline",
    });
    expect(projectView("UPLOADING", undefined)).toEqual({ kind: "interrupted" });
    expect(projectView("CREATED", undefined)).toEqual({ kind: "interrupted" });
  });

  it("polls only while the server is working", () => {
    expect(needsPolling("UPLOADED", undefined)).toBe(true);
    expect(needsPolling("UPLOADING", { phase: "uploading", progress: 0.1 })).toBe(false);
    expect(needsPolling("READY", undefined)).toBe(false);
    expect(needsPolling("FAILED", undefined)).toBe(false);
  });

  it("keeps the chip consistent with the overlay", () => {
    expect(chipStatus("CREATED", projectView("CREATED", { phase: "uploading", progress: 0 }))).toBe("UPLOADING");
    expect(chipStatus("UPLOADING", projectView("UPLOADING", undefined))).toBe("CREATED");
    expect(chipStatus("UPLOADED", projectView("UPLOADED", undefined))).toBe("UPLOADED");
  });
});
