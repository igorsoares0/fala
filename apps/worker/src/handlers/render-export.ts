import { stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@fala/db";
import {
  exportDimensions,
  exportErrorCodeSchema,
  exportKey,
  exportSnapshotSchema,
  type ExportSnapshot,
  type JobPayload,
} from "@fala/shared";
import { JobError } from "../errors";
import { log, sanitizeErrorMessage } from "../log";
import { renderOverlay } from "../media/overlay";
import { probeFile } from "../media/probe";
import { encodeExport } from "../media/render";
import { CommandError } from "../media/run";
import { withTempDir } from "../temp";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"RENDER_EXPORT">;

/** The export still wants this render: not finished, not failed, and its project still exists. */
const stillRendering = (payload: Payload) => ({
  id: payload.exportId,
  projectId: payload.projectId,
  status: { in: ["QUEUED" as const, "RENDERING" as const] },
  project: { deletedAt: null },
});

/** Progress bands: drawing captions 0–30 %, encoding 30–95 %, upload 95–100 %. */
const OVERLAY_SHARE = 30;
const ENCODE_END = 95;
const PROGRESS_WRITE_MS = 1_000;

/** Output may differ from the source by this much (frame rounding, audio priming). */
const DURATION_TOLERANCE_MS = 500;

/**
 * Renders an export's frozen snapshot to an MP4 with burned-in captions (spec
 * FR-11, §10): captions drawn by Chromium with the preview's CSS, composited and
 * encoded by FFmpeg, checked with ffprobe and stored under the export's own key,
 * so a retry never touches another version.
 */
export const renderExport: JobHandler<Payload> = {
  async run({ job, payload, signal, storage, config }) {
    const record = await db.export.findFirst({
      where: stillRendering(payload),
      select: { resolution: true, snapshot: true, project: { select: { userId: true } } },
    });
    if (!record) return noChanges;
    const parsed = exportSnapshotSchema.safeParse(record.snapshot);
    if (!parsed.success) throw new JobError("RENDER_FAILED", "Invalid export snapshot", { retryable: false });
    const snapshot: ExportSnapshot = parsed.data;
    const { width, height } = exportDimensions(snapshot.width, snapshot.height, record.resolution);

    await db.export.updateMany({
      where: stillRendering(payload),
      data: { status: "RENDERING", progress: 0, startedAt: new Date(), errorCode: null },
    });
    const progress = progressWriter(payload);

    return withTempDir(config.tempDir, job.id, async (dir) => {
      const sourcePath = path.join(dir, "source");
      const outputPath = path.join(dir, "export.mp4");

      if (!(await storage.headObject(snapshot.sourceObjectKey))) {
        throw new JobError("SOURCE_MISSING", "Source object is gone", { retryable: false });
      }
      await storage.downloadToFile(snapshot.sourceObjectKey, sourcePath, signal);

      const overlay = await renderOverlay({
        track: snapshot.track,
        style: snapshot.style,
        width,
        height,
        durationMs: snapshot.durationMs,
        dir,
        chromiumPath: config.chromiumPath,
        signal,
        onProgress: (fraction) => progress.report(fraction * OVERLAY_SHARE),
      });

      try {
        await encodeExport({
          ffmpegPath: config.ffmpegPath,
          sourcePath,
          overlayListPath: overlay.listPath,
          band: overlay.band,
          width,
          height,
          durationMs: snapshot.durationMs,
          outputPath,
          signal,
          onProgress: (fraction) => progress.report(OVERLAY_SHARE + fraction * (ENCODE_END - OVERLAY_SHARE)),
        });
      } catch (error) {
        if (error instanceof CommandError && error.reason !== "aborted") {
          // FFmpeg's own words are what make a render failure diagnosable (FR-11).
          log.warn("render.ffmpeg_failed", { jobId: job.id, exportId: payload.exportId, reason: error.reason, stderr: sanitizeErrorMessage(error.stderr) });
          throw error.reason === "timeout"
            ? new JobError("RENDER_TIMEOUT", "FFmpeg timed out", { retryable: true })
            : new JobError("RENDER_FAILED", error.message, { retryable: true });
        }
        throw error;
      }

      const output = await probeFile(config.ffprobePath, outputPath, signal);
      const video = output.streams.find((stream) => stream.codec_type === "video");
      const outputMs = Math.round(Number(output.format.duration ?? 0) * 1000);
      if (video?.width !== width || video?.height !== height || Math.abs(outputMs - snapshot.durationMs) > DURATION_TOLERANCE_MS) {
        throw new JobError(
          "RENDER_FAILED",
          `Unexpected output: ${video?.width}x${video?.height}, ${outputMs} ms (wanted ${width}x${height}, ${snapshot.durationMs} ms)`,
          { retryable: true },
        );
      }

      progress.report(ENCODE_END);
      const key = exportKey(record.project.userId, payload.projectId, payload.exportId);
      await storage.uploadFile(key, outputPath, "video/mp4");
      const { size } = await stat(outputPath);
      log.info("render.done", { jobId: job.id, exportId: payload.exportId, width, height, overlayFrames: overlay.frameCount, bytes: size });

      return async (tx) => {
        await tx.export.updateMany({
          where: stillRendering(payload),
          data: {
            status: "SUCCEEDED",
            progress: 100,
            objectKey: key,
            width,
            height,
            durationMs: outputMs,
            fileSizeBytes: size,
            completedAt: new Date(),
          },
        });
      };
    });
  },

  async onPermanentFailure(tx, payload, code) {
    const errorCode = exportErrorCodeSchema.safeParse(code).success ? code : "RENDER_FAILED";
    await tx.export.updateMany({ where: stillRendering(payload), data: { status: "FAILED", errorCode, completedAt: new Date() } });
  },
};

/** Saves progress at most once a second and only forward, so polling clients see it climb. */
function progressWriter(payload: Payload) {
  let saved = 0;
  let lastWrite = 0;
  return {
    report(percent: number) {
      const value = Math.min(99, Math.floor(percent));
      if (value <= saved || Date.now() - lastWrite < PROGRESS_WRITE_MS) return;
      saved = value;
      lastWrite = Date.now();
      db.export
        .updateMany({ where: { ...stillRendering(payload), progress: { lt: value } }, data: { progress: value } })
        .catch(() => {});
    },
  };
}
