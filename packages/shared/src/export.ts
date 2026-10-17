import { z } from "zod";
import { captionTrackSchema } from "./captions";
import { captionStyleSchema, presetKeySchema } from "./style";

/** Export resolutions offered to the user: the output's short side in px (720p, 1080p). */
export const EXPORT_RESOLUTIONS = [720, 1080] as const;

export const exportResolutionSchema = z.union([z.literal(720), z.literal(1080)]);

export type ExportResolution = z.infer<typeof exportResolutionSchema>;

export const EXPORT_STATUSES = ["QUEUED", "RENDERING", "SUCCEEDED", "FAILED", "EXPIRED"] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const isActiveExport = (status: ExportStatus) => status === "QUEUED" || status === "RENDERING";

/**
 * Output size for `target`: the short side becomes `target` unless the source is
 * smaller (never upscale). Both sides are even, as H.264 with 4:2:0 chroma requires.
 */
export function exportDimensions(width: number, height: number, target: number): { width: number; height: number } {
  const shortSide = Math.min(width, height);
  const scale = Math.min(1, target / shortSide);
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * What an export renders, frozen when the user clicks Render (spec §10.1): later
 * edits in the editor never change a job that's already queued or running.
 */
export const exportSnapshotSchema = z.object({
  sourceObjectKey: z.string().min(1).max(512),
  captionVersion: z.int().min(1),
  track: captionTrackSchema,
  presetKey: presetKeySchema,
  style: captionStyleSchema,
  /** Source display size and length. */
  width: z.int().min(1),
  height: z.int().min(1),
  durationMs: z.int().min(1),
});

export type ExportSnapshot = z.infer<typeof exportSnapshotSchema>;

/** Why an export failed. Stored on the export; shown as `EXPORT_ERRORS[code]`. */
export const EXPORT_ERROR_CODES = ["RENDER_FAILED", "RENDER_TIMEOUT", "SOURCE_MISSING"] as const;

export const exportErrorCodeSchema = z.enum(EXPORT_ERROR_CODES);

export type ExportErrorCode = z.infer<typeof exportErrorCodeSchema>;

export const EXPORT_ERRORS: Record<ExportErrorCode, string> = {
  RENDER_FAILED: "It was a failure on our server, not in your project. Your captions are intact.",
  RENDER_TIMEOUT: "Rendering took too long on our server. Your captions are intact — try again.",
  SOURCE_MISSING: "The original video is no longer available, so this version can't be rendered.",
};

export function exportErrorFor(code: string | null | undefined): string {
  const parsed = exportErrorCodeSchema.safeParse(code);
  return EXPORT_ERRORS[parsed.success ? parsed.data : "RENDER_FAILED"];
}

/** Short reference shown with a failure, so support can find the export: "8F2K-41". */
export function exportErrorRef(exportId: string): string {
  const tail = exportId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(6, "0");
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

/** Download name: the project's name as a slug plus the version, e.g. "my-trip_v2.mp4". */
export function exportFileName(projectName: string, version: number): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "video"}_v${version}.mp4`;
}

/** Body of `POST /api/projects/:projectId/exports`. */
export const createExportRequestSchema = z.object({
  resolution: exportResolutionSchema,
  /** The caption version the editor has saved; the snapshot must match it. */
  captionVersion: z.int().min(1),
});

export const exportIdSchema = z.string().min(1).max(64);
