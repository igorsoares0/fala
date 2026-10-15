import { runCommand } from "./run";

const THUMBNAIL_WIDTH = 540;
const THUMBNAIL_TIMEOUT_MS = 60_000;

/**
 * Writes a JPEG of one frame near the start (1s in, or the midpoint of very short
 * clips). FFmpeg applies rotation metadata, so phone videos come out upright.
 */
export async function extractThumbnail(
  ffmpegPath: string,
  sourcePath: string,
  outputPath: string,
  durationMs: number,
  signal?: AbortSignal,
) {
  const atSeconds = Math.min(1, durationMs / 2000).toFixed(3);
  await runCommand(
    ffmpegPath,
    [
      "-nostdin",
      "-v", "error",
      "-ss", atSeconds,
      "-i", sourcePath,
      "-frames:v", "1",
      "-vf", `scale='min(${THUMBNAIL_WIDTH},iw)':-2`,
      "-q:v", "4",
      "-y", outputPath,
    ],
    { timeoutMs: THUMBNAIL_TIMEOUT_MS, signal },
  );
}
