import type { Prisma } from "@fala/db";
import type { ProjectErrorCode } from "@fala/shared";
import type { Storage } from "@fala/storage";
import type { WorkerConfig } from "../config";
import type { ClaimedJob } from "../queue";

export type HandlerContext<Payload> = {
  job: ClaimedJob;
  payload: Payload;
  signal: AbortSignal;
  storage: Storage;
  config: WorkerConfig;
};

/** Database changes that publish a job's result; committed atomically with the job's completion. */
export type ApplyResult = (tx: Prisma.TransactionClient) => Promise<void>;

export type JobHandler<Payload> = {
  /** Does the slow work outside any transaction and returns how to publish the result. */
  run(context: HandlerContext<Payload>): Promise<ApplyResult>;
  /** Records a permanent failure on the project, in the same transaction that fails the job. */
  onPermanentFailure(tx: Prisma.TransactionClient, payload: Payload, code: ProjectErrorCode): Promise<void>;
};

export const noChanges: ApplyResult = async () => {};
