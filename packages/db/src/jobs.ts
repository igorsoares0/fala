import { jobPayloadSchemas, type EmailData, type EmailTemplate, type JobPayload, type JobType } from "@fala/shared";
import type { Prisma } from "./generated/prisma/client";

type JobWriter = Pick<Prisma.TransactionClient, "job">;

type JobOptions = { maxAttempts?: number; exportId?: string; /** Not before this time. */ availableAt?: Date };

function jobData<T extends JobType>(type: T, projectId: string | null, payload: JobPayload<T>, options: JobOptions) {
  const validPayload = jobPayloadSchemas[type].parse(payload) as Prisma.InputJsonValue;
  return { type, projectId, payload: validPayload, maxAttempts: options.maxAttempts, exportId: options.exportId, availableAt: options.availableAt };
}

/**
 * Adds a job to the Postgres queue. Pass the transaction client so the job is
 * created atomically with the state change that requires it (spec §5.2).
 * `projectId` is null for account-level work.
 */
export async function enqueueJob<T extends JobType>(
  tx: JobWriter,
  type: T,
  projectId: string | null,
  payload: JobPayload<T>,
  options: JobOptions = {},
) {
  return tx.job.create({ data: jobData(type, projectId, payload, options), select: { id: true } });
}

/**
 * Like enqueueJob, but at most once per `dedupeKey`: a second call is silently
 * skipped (ON CONFLICT DO NOTHING, so it never aborts the surrounding transaction).
 * Returns whether this call queued the job.
 */
export async function enqueueJobOnce<T extends JobType>(
  tx: JobWriter,
  type: T,
  projectId: string | null,
  payload: JobPayload<T>,
  dedupeKey: string,
  options: JobOptions = {},
): Promise<boolean> {
  const { count } = await tx.job.createMany({ data: [{ ...jobData(type, projectId, payload, options), dedupeKey }], skipDuplicates: true });
  return count === 1;
}

/**
 * Queues one email (spec FR-15). `dedupeKey` names the occurrence ("export-ready:{exportId}"),
 * so retries and replays send it once. Never blocks the caller on the email provider.
 */
export function enqueueEmail(
  tx: JobWriter,
  { template, to, data = {}, dedupeKey }: { template: EmailTemplate; to: string; data?: EmailData; dedupeKey: string },
) {
  return enqueueJobOnce(tx, "SEND_EMAIL", null, { template, to, data }, `email:${dedupeKey}`, { maxAttempts: 5 });
}
