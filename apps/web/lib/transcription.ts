import "server-only";
import { db, enqueueJob, reserveTranscription } from "@fala/db";
import { captionTrackSchema, isRetryableProjectError, PROJECT_ERRORS, usageSeconds, type CaptionTrack } from "@fala/shared";

/**
 * Transcription for the web app: retrying after a failure and reading the caption
 * track. Ownership-scoped like lib/projects.ts.
 */

export type RetryResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

/** Re-queues transcription of the already validated video, without a new upload (spec §11). */
export async function retryTranscription(userId: string, projectId: string): Promise<RetryResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { status: true, errorCode: true, sourceObjectKey: true, durationMs: true },
  });
  if (!project) return { ok: false, status: 404, error: "This project doesn't exist anymore." };
  if (project.status !== "FAILED" || !isRetryableProjectError(project.errorCode) || !project.sourceObjectKey) {
    return { ok: false, status: 409, error: "There's nothing to retry for this project." };
  }
  const sourceObjectKey = project.sourceObjectKey;
  const seconds = usageSeconds(project.durationMs ?? 0);

  const outcome = await db.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id: projectId, userId, deletedAt: null, status: "FAILED", errorCode: project.errorCode, sourceObjectKey },
      data: { status: "PROCESSING", errorCode: null },
    });
    if (count !== 1) return "raced" as const;
    // The minutes were given back when it failed: take them again (or refuse, if they're gone).
    const reservation = await reserveTranscription(tx, { userId, projectId, sourceObjectKey, seconds });
    if (!reservation.ok) {
      await tx.project.update({ where: { id: projectId }, data: { status: "FAILED", errorCode: "USAGE_LIMIT" } });
      return "no-minutes" as const;
    }
    await enqueueJob(tx, "TRANSCRIBE_VIDEO", projectId, { projectId, sourceObjectKey });
    return "queued" as const;
  });
  if (outcome === "no-minutes") return { ok: false, status: 409, error: PROJECT_ERRORS.USAGE_LIMIT.body };
  // A concurrent retry won the race and already queued the job.
  return outcome === "queued" ? { ok: true } : { ok: false, status: 409, error: "Transcription is already running." };
}

/** The editable captions of a READY project, validated, with their version; null when there are none. */
export async function getCaptionTrack(
  userId: string,
  projectId: string,
): Promise<{ track: CaptionTrack; version: number } | null> {
  const row = await db.captionTrack.findFirst({
    where: { projectId, project: { userId, deletedAt: null } },
    select: { language: true, words: true, blocks: true, version: true },
  });
  if (!row) return null;
  const parsed = captionTrackSchema.safeParse(row);
  return parsed.success ? { track: parsed.data, version: row.version } : null;
}
