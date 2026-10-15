import { mimeTypeForFile, PROJECT_ERRORS, UPLOAD_LIMITS, type AcceptedVideoMimeType } from "@fala/shared";

/** `accept` for file inputs: the formats the drop zone advertises. */
export const VIDEO_FILE_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

type FileCheck = { ok: true; mimeType: AcceptedVideoMimeType } | { ok: false; error: string };

const DURATION_TOLERANCE_MS = 500;
const METADATA_TIMEOUT_MS = 5_000;

/**
 * Quick checks in the browser before anything is created or sent, so obviously
 * wrong files fail instantly. The worker re-checks everything: when the browser
 * can't read a file's duration (some MOV codecs), the file is let through.
 */
export async function checkVideoFile(file: File): Promise<FileCheck> {
  const mimeType = mimeTypeForFile(file.name, file.type);
  if (!mimeType) return { ok: false, error: "That file type isn't supported. Use an MP4, MOV or WEBM." };
  if (file.size === 0) return { ok: false, error: "That file is empty. Choose another one." };
  if (file.size > UPLOAD_LIMITS.maxBytes) return { ok: false, error: PROJECT_ERRORS.FILE_TOO_LARGE.body };

  const durationMs = await readDurationMs(file);
  if (durationMs !== null && durationMs > UPLOAD_LIMITS.maxDurationMs + DURATION_TOLERANCE_MS) {
    return { ok: false, error: PROJECT_ERRORS.VIDEO_TOO_LONG.body };
  }
  return { ok: true, mimeType };
}

function readDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), METADATA_TIMEOUT_MS);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
