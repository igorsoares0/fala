import type { ProjectStatus } from "@fala/shared";
import type { LocalUpload } from "./upload-store";

/**
 * What a project card or the editor shows, combining the server status with an
 * upload running in this tab. Pure, so the rules are unit-tested.
 */
export type ProjectView =
  | { kind: "processing"; stage: ProcessingStage; percent: number }
  | { kind: "upload-failed"; error: string }
  | { kind: "interrupted" }
  | { kind: "failed" }
  | { kind: "settled" };

export type ProcessingStage = "upload" | "validate" | "transcribe";

/** Overall progress bands from the handoff: upload 0–40, validation 40–50, transcription 50–100. */
const UPLOAD_SHARE = 40;
const VALIDATING_PERCENT = 45;
const TRANSCRIBING_PERCENT = 50;

const AWAITING_FILE: ProjectStatus[] = ["CREATED", "UPLOADING"];

export function projectView(status: ProjectStatus, local: LocalUpload | undefined): ProjectView {
  // This tab's upload is authoritative until the server has moved past it.
  const localIsCurrent = local && (local.phase !== "confirmed" || AWAITING_FILE.includes(status));
  if (localIsCurrent) {
    if (local.phase === "failed") return { kind: "upload-failed", error: local.error ?? "The upload stopped." };
    return { kind: "processing", stage: "upload", percent: Math.round(local.progress * UPLOAD_SHARE) };
  }

  switch (status) {
    case "CREATED":
    case "UPLOADING":
      // No upload in this tab: the page was reloaded or closed mid-upload.
      return { kind: "interrupted" };
    case "UPLOADED":
      return { kind: "processing", stage: "validate", percent: VALIDATING_PERCENT };
    case "PROCESSING":
      return { kind: "processing", stage: "transcribe", percent: TRANSCRIBING_PERCENT };
    case "FAILED":
      return { kind: "failed" };
    default:
      return { kind: "settled" };
  }
}

/** Server work is still running: keep refreshing to pick up the result. */
export function needsPolling(status: ProjectStatus, local: LocalUpload | undefined) {
  const view = projectView(status, local);
  return view.kind === "processing" && view.stage !== "upload";
}

/** The status to show in the chip, so it agrees with the overlay. */
export function chipStatus(status: ProjectStatus, view: ProjectView): ProjectStatus {
  if (view.kind === "processing" && view.stage === "upload") return "UPLOADING";
  if (view.kind === "upload-failed") return "FAILED";
  if (view.kind === "interrupted") return "CREATED";
  return status;
}
