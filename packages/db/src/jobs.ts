import { jobPayloadSchemas, type JobPayload, type JobType } from "@fala/shared";
import type { Prisma } from "./generated/prisma/client";

type JobWriter = Pick<Prisma.TransactionClient, "job">;

/**
 * Adds a job to the Postgres queue. Pass the transaction client so the job is
 * created atomically with the state change that requires it (spec §5.2).
 */
export async function enqueueJob<T extends JobType>(
  tx: JobWriter,
  type: T,
  projectId: string,
  payload: JobPayload<T>,
  options: { maxAttempts?: number } = {},
) {
  const validPayload = jobPayloadSchemas[type].parse(payload) as Prisma.InputJsonValue;
  return tx.job.create({
    data: { type, projectId, payload: validPayload, maxAttempts: options.maxAttempts },
    select: { id: true },
  });
}
