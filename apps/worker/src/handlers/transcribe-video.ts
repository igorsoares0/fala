import path from "node:path";
import { db, type Prisma } from "@fala/db";
import {
  blockWords,
  DEFAULT_PRESET_KEY,
  normalizeWords,
  PRESETS,
  segmentWords,
  type JobPayload,
} from "@fala/shared";
import { JobError } from "../errors";
import { extractAudio } from "../media/audio";
import { withTempDir } from "../temp";
import { TranscriptionError } from "../transcription";
import { noChanges, type JobHandler } from "./types";

type Payload = JobPayload<"TRANSCRIBE_VIDEO">;

/** The project still expects captions for this exact upload; otherwise the result is stale. */
const stillWaitingFor = (payload: Payload) => ({
  id: payload.projectId,
  status: "PROCESSING" as const,
  sourceObjectKey: payload.sourceObjectKey,
  deletedAt: null,
});

/**
 * Extracts the audio, transcribes it with word timestamps, segments the words into
 * caption blocks and stores both the original transcript and the editable track
 * (spec FR-05, FR-06). The project becomes READY.
 */
export const transcribeVideo: JobHandler<Payload> = {
  async run({ job, payload, signal, storage, config, transcriber }) {
    const project = await db.project.findFirst({ where: stillWaitingFor(payload), select: { durationMs: true } });
    if (!project) return noChanges;
    if (!project.durationMs) throw new JobError("PROCESSING_FAILED", "Project has no duration", { retryable: false });
    const durationMs = project.durationMs;

    return withTempDir(config.tempDir, job.id, async (dir) => {
      const sourcePath = path.join(dir, "source");
      const audioPath = path.join(dir, "audio.m4a");
      await storage.downloadToFile(payload.sourceObjectKey, sourcePath, signal);
      await extractAudio(config.ffmpegPath, sourcePath, audioPath, signal, durationMs);

      let result;
      try {
        result = await transcriber.transcribe({ audioPath, durationMs, signal });
      } catch (error) {
        if (error instanceof TranscriptionError) {
          throw error.kind === "no-speech"
            ? new JobError("NO_SPEECH", error.message, { retryable: false })
            : new JobError("TRANSCRIPTION_FAILED", error.message, { retryable: true });
        }
        throw error;
      }

      const words = normalizeWords(result.words, durationMs);
      if (words.length === 0) throw new JobError("NO_SPEECH", "Transcript has no usable words", { retryable: false });
      // Until projects carry their own style (Phase 4), blocks follow the default preset.
      const blocks = segmentWords(words, {
        maxWords: PRESETS[DEFAULT_PRESET_KEY].style.maxW,
        durationMs,
        language: result.language,
      });
      const captionSample = blockWords({ words }, blocks[0]).map((word) => word.text);

      return async (tx) => {
        const { count } = await tx.project.updateMany({
          where: stillWaitingFor(payload),
          data: { status: "READY", errorCode: null, captionSample },
        });
        if (count !== 1) return;

        const transcript = {
          sourceObjectKey: payload.sourceObjectKey,
          provider: result.provider,
          model: result.model,
          language: result.language,
          languageConfidence: result.languageConfidence,
          fullText: result.text,
          words: words as unknown as Prisma.InputJsonValue,
        };
        await tx.transcript.upsert({
          where: { projectId: payload.projectId },
          create: { projectId: payload.projectId, ...transcript },
          update: transcript,
        });

        const track = {
          language: result.language,
          words: words as unknown as Prisma.InputJsonValue,
          blocks: blocks as unknown as Prisma.InputJsonValue,
          version: 1,
        };
        await tx.captionTrack.upsert({
          where: { projectId: payload.projectId },
          create: { projectId: payload.projectId, ...track },
          update: track,
        });
      };
    });
  },

  async onPermanentFailure(tx, payload, code) {
    // A generic failure here is still a transcription failure: the video itself is fine and can be retried.
    const errorCode = code === "NO_SPEECH" ? "NO_SPEECH" : "TRANSCRIPTION_FAILED";
    await tx.project.updateMany({ where: stillWaitingFor(payload), data: { status: "FAILED", errorCode } });
  },
};
