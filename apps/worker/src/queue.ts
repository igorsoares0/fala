import { db, type JobType, type Prisma } from "@fala/db";
import { LeaseLostError } from "./errors";

/**
 * Postgres job queue (spec §7). Every statement is short; no transaction stays
 * open while media is processed. Lease times use the database clock so workers
 * on different machines agree on when a lease expired. Columns are
 * `timestamp without time zone` holding UTC, hence `timezone('UTC', now())`.
 */

export type ClaimedJob = {
  id: string;
  projectId: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

/**
 * Claims the oldest runnable job: PENDING/RETRY_WAIT jobs that are due, or RUNNING
 * jobs whose lease expired (their worker crashed). SKIP LOCKED lets several workers
 * claim concurrently without ever getting the same row.
 */
export async function claimJob(workerId: string, leaseMs: number): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "job" SET
      "status" = 'RUNNING',
      "lockedBy" = ${workerId},
      "lockedAt" = timezone('UTC', now()),
      "leaseExpiresAt" = timezone('UTC', now()) + make_interval(secs => ${leaseMs / 1000}::double precision),
      "startedAt" = COALESCE("startedAt", timezone('UTC', now())),
      "attempts" = "attempts" + 1,
      "updatedAt" = timezone('UTC', now())
    WHERE "id" = (
      SELECT "id" FROM "job"
      WHERE ("status" IN ('PENDING', 'RETRY_WAIT') AND "availableAt" <= timezone('UTC', now()))
         OR ("status" = 'RUNNING' AND "leaseExpiresAt" < timezone('UTC', now()))
      ORDER BY "availableAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "projectId", "type"::text AS "type", "payload", "attempts", "maxAttempts"`;
  return rows[0] ?? null;
}

/** Extends the lease. False means another worker took the job over. */
export async function renewLease(job: ClaimedJob, workerId: string, leaseMs: number): Promise<boolean> {
  const count = await db.$executeRaw`
    UPDATE "job" SET
      "leaseExpiresAt" = timezone('UTC', now()) + make_interval(secs => ${leaseMs / 1000}::double precision),
      "updatedAt" = timezone('UTC', now())
    WHERE "id" = ${job.id} AND "lockedBy" = ${workerId} AND "status" = 'RUNNING'`;
  return count === 1;
}

const ownedRunning = (job: ClaimedJob, workerId: string) => ({ id: job.id, lockedBy: workerId, status: "RUNNING" as const });

/**
 * Marks the job SUCCEEDED and applies its result in one transaction, fenced by
 * `lockedBy`: a worker that lost its lease can't publish a stale result.
 */
export async function completeJob(
  job: ClaimedJob,
  workerId: string,
  apply: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.job.updateMany({
      where: ownedRunning(job, workerId),
      data: { status: "SUCCEEDED", completedAt: new Date(), lockedBy: null, leaseExpiresAt: null },
    });
    if (count !== 1) throw new LeaseLostError();
    await apply(tx);
  });
}

/** Gives up on the job for good and records why, together with the project's failure state. */
export async function failJob(
  job: ClaimedJob,
  workerId: string,
  failure: { code: string; message: string },
  applyFailure: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.job.updateMany({
      where: ownedRunning(job, workerId),
      data: {
        status: "FAILED",
        completedAt: new Date(),
        lockedBy: null,
        leaseExpiresAt: null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
      },
    });
    if (count !== 1) throw new LeaseLostError();
    await applyFailure(tx);
  });
}

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** Exponential backoff: 5s, 10s, 20s… capped at 5 minutes. */
export function backoffMs(attempts: number) {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** Schedules another attempt after a recoverable error. */
export async function retryJobLater(job: ClaimedJob, workerId: string, failure: { code: string; message: string }) {
  const count = await db.$executeRaw`
    UPDATE "job" SET
      "status" = 'RETRY_WAIT',
      "availableAt" = timezone('UTC', now()) + make_interval(secs => ${backoffMs(job.attempts) / 1000}::double precision),
      "lockedBy" = NULL,
      "leaseExpiresAt" = NULL,
      "lastErrorCode" = ${failure.code},
      "lastErrorMessage" = ${failure.message},
      "updatedAt" = timezone('UTC', now())
    WHERE "id" = ${job.id} AND "lockedBy" = ${workerId} AND "status" = 'RUNNING'`;
  if (count !== 1) throw new LeaseLostError();
}

/** Puts an unfinished job back without counting the attempt (graceful shutdown). */
export async function releaseJob(job: ClaimedJob, workerId: string) {
  await db.$executeRaw`
    UPDATE "job" SET
      "status" = 'PENDING',
      "attempts" = GREATEST("attempts" - 1, 0),
      "lockedBy" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = timezone('UTC', now())
    WHERE "id" = ${job.id} AND "lockedBy" = ${workerId} AND "status" = 'RUNNING'`;
}
