import { runCommand } from "./run";
import type { Band } from "./overlay";

/**
 * Burns the caption overlay into the video (spec §10.2): scales the source to the
 * export size, composites the overlay pictures in their band and encodes an MP4
 * that plays everywhere (H.264 + AAC, moov atom first).
 */
export async function encodeExport({
  ffmpegPath,
  sourcePath,
  overlayListPath,
  band,
  width,
  height,
  durationMs,
  outputPath,
  signal,
  onProgress,
}: {
  ffmpegPath: string;
  sourcePath: string;
  overlayListPath: string;
  band: Band;
  width: number;
  height: number;
  durationMs: number;
  outputPath: string;
  signal?: AbortSignal;
  /** Fraction of the video encoded, 0–1. */
  onProgress?: (fraction: number) => void;
}) {
  let pending = "";
  await runCommand(ffmpegPath, encodeArgs({ sourcePath, overlayListPath, band, width, height, outputPath }), {
    timeoutMs: renderTimeoutMs(durationMs),
    signal,
    onStdout: (chunk) => {
      // `-progress pipe:1` prints key=value lines; out_time_us is how far the output has got.
      const lines = (pending + chunk).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line);
        if (match) onProgress?.(Math.min(1, Number(match[1]) / 1000 / durationMs));
      }
    },
  });
}

/** Generous for a slow machine, but a stuck FFmpeg can't hold the job forever. */
export function renderTimeoutMs(durationMs: number) {
  return Math.max(10 * 60_000, durationMs * 6);
}

export function encodeArgs({
  sourcePath,
  overlayListPath,
  band,
  width,
  height,
  outputPath,
}: {
  sourcePath: string;
  overlayListPath: string;
  band: Band;
  width: number;
  height: number;
  outputPath: string;
}): string[] {
  const filter = [
    // The source is auto-rotated on input, so width × height are display dimensions.
    `[0:v]scale=${width}:${height}:flags=lanczos,setsar=1[base]`,
    `[1:v]format=rgba[captions]`,
    `[base][captions]overlay=x=${band.x}:y=${band.y}:eof_action=pass:format=auto,format=yuv420p[out]`,
  ].join(";");
  return [
    "-nostdin",
    "-v",
    "error",
    "-progress",
    "pipe:1",
    "-nostats",
    "-i",
    sourcePath,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    overlayListPath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-profile:v",
    "high",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ];
}
