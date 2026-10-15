import { z } from "zod";

/**
 * Upload limits shown in the drop zone ("MP4 · MOV · WEBM / up to 3 min · 1 GB")
 * and enforced by the browser, the upload API and the worker.
 * Per-plan limits replace these constants in Phase 6.
 */
export const UPLOAD_LIMITS = {
  maxBytes: 1024 * 1024 * 1024,
  maxDurationMs: 3 * 60 * 1000,
} as const;

/** Accepted MIME types and the extension used for the stored object. */
export const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
} as const;

export type AcceptedVideoMimeType = keyof typeof ACCEPTED_VIDEO_TYPES;

const MIME_TYPES = Object.keys(ACCEPTED_VIDEO_TYPES) as [AcceptedVideoMimeType, ...AcceptedVideoMimeType[]];

export const acceptedVideoMimeTypeSchema = z.enum(MIME_TYPES);

const MIME_BY_EXTENSION: Record<string, AcceptedVideoMimeType> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

/**
 * Resolves the MIME type to upload with. Browsers often leave `File.type` empty
 * (or vague) for .mov files, so a known extension wins. Returns null when the
 * file isn't one of the accepted formats.
 */
export function mimeTypeForFile(fileName: string, browserType: string): AcceptedVideoMimeType | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = MIME_BY_EXTENSION[extension];
  if (byExtension) return byExtension;
  const parsed = acceptedVideoMimeTypeSchema.safeParse(browserType.toLowerCase());
  return parsed.success ? parsed.data : null;
}

export const presignRequestSchema = z.object({
  mimeType: acceptedVideoMimeTypeSchema,
  sizeBytes: z.int().positive().max(UPLOAD_LIMITS.maxBytes),
});

export type PresignRequest = z.infer<typeof presignRequestSchema>;

export type PresignResponse = {
  uploadUrl: string;
  contentType: AcceptedVideoMimeType;
  expiresAt: string;
};

/** "1 GB", "240 MB", "512 KB" — for limits and file sizes in the UI. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
