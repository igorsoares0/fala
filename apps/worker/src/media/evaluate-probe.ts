import { UPLOAD_LIMITS } from "@fala/shared";
import { JobError } from "../errors";
import type { Probe, ProbeStream } from "./probe";

export type VideoMetadata = {
  durationMs: number;
  /** Display dimensions: rotation metadata (phone videos) is already applied. */
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
};

type Limits = { maxBytes: number; maxDurationMs: number };

// Containers ffprobe reports for MP4/MOV and WEBM.
const ACCEPTED_CONTAINERS = ["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"];

// Container durations are often a few frames longer than what the browser showed.
const DURATION_TOLERANCE_MS = 500;

/**
 * Decides whether an uploaded file is a usable video (spec FR-04). Pure, so every
 * rule is unit-tested without media files. Throws a permanent JobError otherwise.
 */
export function evaluateProbe(probe: Probe, sizeBytes: number, limits: Limits = UPLOAD_LIMITS): VideoMetadata {
  const reject = (code: "FILE_TOO_LARGE" | "VIDEO_TOO_LONG" | "NO_AUDIO" | "UNSUPPORTED_FILE", message: string) =>
    new JobError(code, message, { retryable: false });

  if (sizeBytes > limits.maxBytes) throw reject("FILE_TOO_LARGE", `File is ${sizeBytes} bytes`);

  if (!ACCEPTED_CONTAINERS.includes(probe.format.format_name ?? "")) {
    throw reject("UNSUPPORTED_FILE", `Unsupported container ${probe.format.format_name ?? "unknown"}`);
  }

  const video = probe.streams.find(
    (stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1 && stream.width && stream.height,
  );
  if (!video?.width || !video.height) throw reject("UNSUPPORTED_FILE", "No video stream");

  const audio = probe.streams.find((stream) => stream.codec_type === "audio" && stream.channels !== 0);
  if (!audio) throw reject("NO_AUDIO", "No audio stream");

  const durationMs = toMs(probe.format.duration) ?? toMs(video.duration);
  if (durationMs === null || durationMs <= 0) throw reject("UNSUPPORTED_FILE", "Unknown duration");
  if (durationMs > limits.maxDurationMs + DURATION_TOLERANCE_MS) {
    throw reject("VIDEO_TOO_LONG", `Duration is ${durationMs}ms`);
  }

  const quarterTurns = Math.round(rotationDegrees(video) / 90);
  const sideways = Math.abs(quarterTurns) % 2 === 1;

  return {
    durationMs,
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
    videoCodec: video.codec_name ?? "unknown",
    audioCodec: audio.codec_name ?? "unknown",
  };
}

function toMs(seconds: number | string | undefined): number | null {
  if (seconds === undefined) return null;
  const value = typeof seconds === "number" ? seconds : Number.parseFloat(seconds);
  return Number.isFinite(value) ? Math.round(value * 1000) : null;
}

/** Newer ffprobe reports rotation in side data; older files carry a `rotate` tag. */
function rotationDegrees(stream: ProbeStream): number {
  for (const sideData of stream.side_data_list ?? []) {
    const value = Number(sideData.rotation);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  const tag = Number(stream.tags?.rotate);
  return Number.isFinite(tag) ? tag : 0;
}
