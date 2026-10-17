import { z } from "zod";
import { formatBytes, UPLOAD_LIMITS } from "./upload";

/** Why a project ended up FAILED. Stored on the project; shown to the user as `PROJECT_ERRORS[code]`. */
export const PROJECT_ERROR_CODES = [
  "FILE_TOO_LARGE",
  "VIDEO_TOO_LONG",
  "NO_AUDIO",
  "NO_SPEECH",
  "UNSUPPORTED_FILE",
  "UPLOAD_MISSING",
  "TRANSCRIPTION_FAILED",
  "PROCESSING_FAILED",
  "USAGE_LIMIT",
] as const;

export const projectErrorCodeSchema = z.enum(PROJECT_ERROR_CODES);

export type ProjectErrorCode = z.infer<typeof projectErrorCodeSchema>;

const maxMinutes = UPLOAD_LIMITS.maxDurationMs / 60_000;

/** User-facing copy: what happened and what to do next, without internal details. */
export const PROJECT_ERRORS: Record<ProjectErrorCode, { title: string; body: string }> = {
  FILE_TOO_LARGE: {
    title: "This file is too big",
    body: `Videos can be up to ${formatBytes(UPLOAD_LIMITS.maxBytes)}. Export a smaller version and upload it again.`,
  },
  VIDEO_TOO_LONG: {
    title: "This video is too long for your plan",
    body: `Trim it and upload it again, or switch plans for longer videos (up to ${maxMinutes} minutes).`,
  },
  NO_AUDIO: {
    title: "This video has no sound",
    body: "There's no audio track to caption. Upload a version with sound — nothing was deducted from your usage.",
  },
  NO_SPEECH: {
    title: "We couldn't find speech in this file",
    body: "The audio seems silent. Upload another version — nothing was deducted from your usage.",
  },
  UNSUPPORTED_FILE: {
    title: "We couldn't read this file",
    body: "It doesn't look like a video we can open. Try an MP4, MOV or WEBM.",
  },
  UPLOAD_MISSING: {
    title: "The upload didn't finish",
    body: "The file never fully arrived. Choose it again to restart the upload.",
  },
  TRANSCRIPTION_FAILED: {
    title: "Transcription didn't finish",
    body: "It was a problem on our side, not your video. Try again — your upload is kept.",
  },
  PROCESSING_FAILED: {
    title: "Something went wrong on our side",
    body: "It wasn't your file. Upload it again — nothing was deducted from your usage.",
  },
  USAGE_LIMIT: {
    title: "Not enough minutes left",
    body: "This video needs more minutes than your plan has left this period. Nothing was deducted — switch plans or wait for your minutes to renew.",
  },
};

/** Unknown or missing codes (e.g. from older rows) fall back to the generic server error. */
export function projectErrorFor(code: string | null | undefined) {
  const parsed = projectErrorCodeSchema.safeParse(code);
  return PROJECT_ERRORS[parsed.success ? parsed.data : "PROCESSING_FAILED"];
}

/** Failures the user can retry without uploading again: the stored video is fine (after a plan change, for USAGE_LIMIT). */
export function isRetryableProjectError(code: string | null | undefined): boolean {
  return code === "TRANSCRIPTION_FAILED" || code === "USAGE_LIMIT";
}
