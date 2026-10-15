import { z } from "zod";

/**
 * Time convention: every timestamp and duration in Fala is an integer number
 * of milliseconds. Convert to seconds only at the edge (e.g. `<video>.currentTime`,
 * FFmpeg arguments).
 */
export const msSchema = z.number().int().nonnegative();

export type Ms = z.infer<typeof msSchema>;

/** Formats milliseconds as `MM:SS.d`, e.g. 3240 → "00:03.2". */
export function formatTimecode(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const decis = tenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${decis}`;
}

/** Formats milliseconds as a compact duration, e.g. 22700 → "0:23". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
