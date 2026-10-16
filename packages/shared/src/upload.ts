import { z } from "zod";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * What the system handles at most, shown in the drop zone ("up to 30 min · 4 GB")
 * and enforced by the browser, the upload API and the worker. Plans (Phase 6)
 * set lower limits on top of these.
 */
export const UPLOAD_LIMITS = {
  maxBytes: 4 * GB,
  maxDurationMs: 30 * 60 * 1000,
} as const;

/** "up to 30 min · 4 GB" */
export function uploadLimitsLabel(): string {
  return `up to ${UPLOAD_LIMITS.maxDurationMs / 60_000} min · ${formatBytes(UPLOAD_LIMITS.maxBytes)}`;
}

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

/**
 * Uploads go to storage in parts (S3 multipart), so a dropped connection costs one
 * part, not the whole file. S3 needs parts of at least 5 MB (except the last) and
 * at most 10,000 of them; we stay within 1,000.
 */
export const MIN_UPLOAD_PART_BYTES = 5 * MB;
export const DEFAULT_UPLOAD_PART_BYTES = 16 * MB;
const MAX_UPLOAD_PARTS = 1_000;

/** Part size and count for a file of `sizeBytes`. `preferredPartBytes` is a test override. */
export function uploadPartPlan(sizeBytes: number, preferredPartBytes: number = DEFAULT_UPLOAD_PART_BYTES) {
  const partSize = Math.max(MIN_UPLOAD_PART_BYTES, preferredPartBytes, Math.ceil(sizeBytes / MAX_UPLOAD_PARTS));
  return { partSize, partCount: Math.max(1, Math.ceil(sizeBytes / partSize)) };
}

export type PresignResponse = {
  partSize: number;
  partCount: number;
  contentType: AcceptedVideoMimeType;
};

/** Body of `POST /api/projects/:projectId/uploads/parts`: which parts to sign (a batch). */
export const uploadPartsRequestSchema = z.object({
  partNumbers: z.array(z.int().min(1).max(MAX_UPLOAD_PARTS)).min(1).max(20),
});

export type UploadPartsResponse = { urls: { partNumber: number; url: string }[] };

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
