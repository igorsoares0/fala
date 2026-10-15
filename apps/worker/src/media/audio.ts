import { runCommand } from "./run";

const AUDIO_TIMEOUT_MS = 2 * 60_000;

/**
 * Extracts the audio track as mono 16 kHz AAC: what speech recognition needs,
 * and small to upload (~360 KB per minute). The original video is untouched.
 */
export async function extractAudio(ffmpegPath: string, sourcePath: string, outputPath: string, signal?: AbortSignal) {
  await runCommand(
    ffmpegPath,
    ["-nostdin", "-v", "error", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-y", outputPath],
    { timeoutMs: AUDIO_TIMEOUT_MS, signal },
  );
}
