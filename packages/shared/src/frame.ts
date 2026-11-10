import { z } from "zod";

/**
 * Frame: the shape of the exported video. "original" keeps the source as uploaded;
 * the others crop it to an aspect ratio, always filling the frame (no bars).
 * Non-destructive, like the trim: the source stays whole, the preview shows the crop
 * and the export applies it.
 *
 * Social platforms differ in name, not in file: Stories, Reels, Shorts and TikTok all
 * take the same 9:16 video, so the choice is a ratio, labelled with where it fits.
 */
export const FRAME_ASPECTS = ["original", "9:16", "4:5", "1:1", "16:9"] as const;

export const frameAspectSchema = z.enum(FRAME_ASPECTS);

export type FrameAspect = z.infer<typeof frameAspectSchema>;

export const frameSchema = z.object({
  aspect: frameAspectSchema,
  /**
   * Where the crop sits along the axis it cuts: 0 keeps the left (or top) of the
   * source, 1 the right (or bottom), 0.5 the center. Ignored when nothing is cut.
   */
  focus: z.number().min(0).max(1),
});

export type Frame = z.infer<typeof frameSchema>;

export const ORIGINAL_FRAME: Frame = { aspect: "original", focus: 0.5 };

export const FRAME_FORMATS: Record<FrameAspect, { label: string; ratio: number | null; platforms: string }> = {
  original: { label: "Original", ratio: null, platforms: "As uploaded" },
  "9:16": { label: "9:16", ratio: 9 / 16, platforms: "TikTok · Reels · Shorts · Stories" },
  "4:5": { label: "4:5", ratio: 4 / 5, platforms: "Instagram and Facebook feed" },
  "1:1": { label: "1:1", ratio: 1, platforms: "Feeds · LinkedIn · X" },
  "16:9": { label: "16:9", ratio: 16 / 9, platforms: "YouTube · LinkedIn · X" },
};

export const isOriginalFrame = (frame: Frame) => frame.aspect === "original";

/** A frame worth storing: the original has no focus, and a focus is a whole percent. */
export function normalizeFrame(frame: Frame): Frame {
  if (isOriginalFrame(frame)) return ORIGINAL_FRAME;
  return { aspect: frame.aspect, focus: Math.round(Math.min(1, Math.max(0, frame.focus)) * 100) / 100 };
}

/** A source this close to the wanted ratio isn't cropped: a 1080×1920 phone video already is 9:16. */
const SAME_RATIO_TOLERANCE = 0.01;

/** The axis the frame cuts the source along, or null when it keeps all of it. */
export function cropAxis(width: number, height: number, frame: Frame): "x" | "y" | null {
  const { ratio } = FRAME_FORMATS[frame.aspect];
  if (ratio === null) return null;
  const source = width / height;
  if (Math.abs(source - ratio) / ratio <= SAME_RATIO_TOLERANCE) return null;
  return source > ratio ? "x" : "y";
}

export type Rect = { x: number; y: number; width: number; height: number };

const evenFloor = (value: number) => Math.floor(value / 2) * 2;

/**
 * The part of a `width` × `height` source the frame keeps, in source pixels: the
 * largest rectangle of the frame's ratio, placed by its focus. The cut side and its
 * offset are even, as FFmpeg's crop needs for 4:2:0 video.
 */
export function cropRect(width: number, height: number, frame: Frame): Rect {
  const axis = cropAxis(width, height, frame);
  if (!axis) return { x: 0, y: 0, width, height };
  const ratio = FRAME_FORMATS[frame.aspect].ratio!;
  const focus = Math.min(1, Math.max(0, frame.focus));
  if (axis === "x") {
    const cropWidth = Math.min(width, Math.max(2, evenFloor(height * ratio)));
    return { x: evenFloor((width - cropWidth) * focus), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.min(height, Math.max(2, evenFloor(width / ratio)));
  return { x: 0, y: evenFloor((height - cropHeight) * focus), width, height: cropHeight };
}

/**
 * A full-screen vertical video (9:16 or narrower, not 4:5): the kind the apps cover
 * with their own interface, so captions keep clear of its edges.
 */
export function isTallFrame(width: number, height: number): boolean {
  return width / height <= 0.62;
}

/**
 * Roughly where TikTok, Reels and Shorts draw over a full-screen vertical video, as
 * fractions of the frame. No platform publishes exact numbers for regular posts and
 * the apps keep changing, so this is a cautious guide for the editor, not a rule.
 */
export const SAFE_ZONE = { top: 0.12, bottom: 0.25, right: 0.13 } as const;
