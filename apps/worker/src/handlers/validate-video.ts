import path from "node:path";
import { db, enqueueJob } from "@fala/db";
import { thumbnailKey, uploadIdFromSourceKey, type JobPayload } from "@fala/shared";
import { JobError } from "../errors";
import { evaluateProbe } from "../media/evaluate-probe";
import { probeFile } from "../media/probe";
import { extractThumbnail } from "../media/thumbnail";
import { withTempDir } from "../temp";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"VALIDATE_VIDEO">;

/** The project still expects this exact upload; otherwise the result is stale and must not be published. */
const stillWaitingFor = (payload: Payload) => ({
  id: payload.projectId,
  status: "UPLOADED" as const,
  sourceObjectKey: payload.sourceObjectKey,
  deletedAt: null,
});

/**
 * Checks the uploaded file with ffprobe, extracts a thumbnail, stores the metadata
 * and hands the project to transcription (spec FR-04). The original is never modified.
 */
export const validateVideo: JobHandler<Payload> = {
  async run({ job, payload, signal, storage, config }) {
    const project = await db.project.findFirst({ where: stillWaitingFor(payload), select: { userId: true } });
    // Deleted, replaced by a newer upload, or already validated: nothing to do.
    if (!project) return noChanges;

    const uploadId = uploadIdFromSourceKey(payload.sourceObjectKey);
    if (!uploadId) throw new JobError("PROCESSING_FAILED", "Malformed source key", { retryable: false });

    return withTempDir(config.tempDir, job.id, async (dir) => {
      // Local names are fixed; the user's file name never reaches the file system or FFmpeg.
      const sourcePath = path.join(dir, "source");
      const thumbnailPath = path.join(dir, "thumbnail.jpg");

      const head = await storage.headObject(payload.sourceObjectKey);
      if (!head) throw new JobError("UPLOAD_MISSING", "Source object is missing", { retryable: false });

      const sizeBytes = await storage.downloadToFile(payload.sourceObjectKey, sourcePath, signal);
      const probe = await probeFile(config.ffprobePath, sourcePath, signal);
      const metadata = evaluateProbe(probe, sizeBytes);

      await extractThumbnail(config.ffmpegPath, sourcePath, thumbnailPath, metadata.durationMs, signal);
      const thumbnailObjectKey = thumbnailKey(project.userId, payload.projectId, uploadId);
      await storage.uploadFile(thumbnailObjectKey, thumbnailPath, "image/jpeg");

      return async (tx) => {
        const { count } = await tx.project.updateMany({
          where: stillWaitingFor(payload),
          data: { status: "PROCESSING", errorCode: null, thumbnailObjectKey, ...metadata },
        });
        if (count === 1) {
          await enqueueJob(tx, "TRANSCRIBE_VIDEO", payload.projectId, {
            projectId: payload.projectId,
            sourceObjectKey: payload.sourceObjectKey,
          });
        }
      };
    });
  },

  async onPermanentFailure(tx, payload, code) {
    await tx.project.updateMany({ where: stillWaitingFor(payload), data: { status: "FAILED", errorCode: code } });
  },
};
