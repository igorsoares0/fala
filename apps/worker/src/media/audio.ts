import { runCommand } from "./run";

/** Generous for a slow machine; grows with the video, so a 30-minute file isn't cut off. */
export function audioTimeoutMs(durationMs?: number) {
  return Math.max(2 * 60_000, (durationMs ?? 0) / 2);
}

/**
 * Extracts the audio track as mono 16 kHz AAC: what speech recognition needs,
 * and small to upload (~360 KB per minute). The original video is untouched.
 */
export async function extractAudio(
  ffmpegPath: string,
  sourcePath: string,
  outputPath: string,
  signal?: AbortSignal,
  durationMs?: number,
) {
  await runCommand(
    ffmpegPath,
    ["-nostdin", "-v", "error", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-y", outputPath],
    { timeoutMs: audioTimeoutMs(durationMs), signal },
  );
}
