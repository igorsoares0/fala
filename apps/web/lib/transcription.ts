import "server-only";
import { db, enqueueJob } from "@fala/db";
import { captionTrackSchema, isRetryableProjectError, type CaptionTrack } from "@fala/shared";

/**
 * Transcription for the web app: retrying after a failure and reading the caption
 * track. Ownership-scoped like lib/projects.ts.
 */

export type RetryResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

/** Re-queues transcription of the already validated video, without a new upload (spec §11). */
export async function retryTranscription(userId: string, projectId: string): Promise<RetryResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { status: true, errorCode: true, sourceObjectKey: true },
  });
  if (!project) return { ok: false, status: 404, error: "This project doesn't exist anymore." };
  if (project.status !== "FAILED" || !isRetryableProjectError(project.errorCode) || !project.sourceObjectKey) {
    return { ok: false, status: 409, error: "There's nothing to retry for this project." };
  }
  const sourceObjectKey = project.sourceObjectKey;

  const queued = await db.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id: projectId, userId, deletedAt: null, status: "FAILED", errorCode: project.errorCode, sourceObjectKey },
      data: { status: "PROCESSING", errorCode: null },
    });
    if (count !== 1) return false;
    await enqueueJob(tx, "TRANSCRIBE_VIDEO", projectId, { projectId, sourceObjectKey });
    return true;
  });
  // A concurrent retry won the race and already queued the job.
  return queued ? { ok: true } : { ok: false, status: 409, error: "Transcription is already running." };
}

/** The editable captions of a READY project, validated; null when there are none. */
export async function getCaptionTrack(userId: string, projectId: string): Promise<CaptionTrack | null> {
  const track = await db.captionTrack.findFirst({
    where: { projectId, project: { userId, deletedAt: null } },
    select: { language: true, words: true, blocks: true },
  });
  if (!track) return null;
  const parsed = captionTrackSchema.safeParse(track);
  return parsed.success ? parsed.data : null;
}
