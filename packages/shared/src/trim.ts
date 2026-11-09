import { z } from "zod";

/**
 * Trim: the part of the source video the export keeps, as a start and an end in
 * source time (integer ms). Non-destructive: the original file and the captions
 * stay as they are; the preview plays only this range and the export renders it,
 * with captions shifted to start at zero.
 */

/** The kept range never gets shorter than this (or than the video, when it's shorter). */
export const MIN_TRIM_MS = 1000;

export const trimSchema = z
  .object({ startMs: z.int().min(0), endMs: z.int().min(1) })
  .refine((trim) => trim.endMs > trim.startMs, { message: "A trim must end after it starts." });

export type Trim = z.infer<typeof trimSchema>;

export type TrimEdge = "start" | "end";

/** The whole video: what a project has until the user trims it. */
export function fullTrim(durationMs: number): Trim {
  return { startMs: 0, endMs: durationMs };
}

export function trimLengthMs(trim: Trim): number {
  return trim.endMs - trim.startMs;
}

export function isTrimmed(trim: Trim, durationMs: number): boolean {
  return trim.startMs > 0 || trim.endMs < durationMs;
}

const minLength = (durationMs: number) => Math.min(MIN_TRIM_MS, durationMs);

/**
 * A valid trim for a video of `durationMs`: whole ms, inside the video, at least the
 * minimum length. The start gives way before the end does, so a range pushed against
 * the end of the video keeps its end.
 */
export function clampTrim(trim: Trim, durationMs: number): Trim {
  const min = minLength(durationMs);
  const endMs = Math.min(durationMs, Math.max(min, Math.round(trim.endMs)));
  const startMs = Math.min(endMs - min, Math.max(0, Math.round(trim.startMs)));
  return { startMs, endMs };
}

/** Moves one edge to `valueMs`, never out of the video nor closer to the other edge than the minimum length. */
export function moveTrimEdge(trim: Trim, edge: TrimEdge, valueMs: number, durationMs: number): Trim {
  const min = minLength(durationMs);
  const value = Math.round(valueMs);
  const next =
    edge === "start"
      ? { startMs: Math.min(trim.endMs - min, Math.max(0, value)), endMs: trim.endMs }
      : { startMs: trim.startMs, endMs: Math.max(trim.startMs + min, Math.min(durationMs, value)) };
  return next.startMs === trim.startMs && next.endMs === trim.endMs ? trim : next;
}

/** Whether any part of `[startMs, endMs)` plays inside the kept range. */
export function overlapsTrim(range: { startMs: number; endMs: number }, trim: Trim): boolean {
  return range.startMs < trim.endMs && range.endMs > trim.startMs;
}
