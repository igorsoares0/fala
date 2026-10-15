import { jobPayloadSchemas } from "@fala/shared";
import type { Storage } from "@fala/storage";
import type { WorkerConfig } from "./config";
import { JobError, LeaseLostError, ShutdownError } from "./errors";
import { handlers } from "./handlers";
import type { JobHandler } from "./handlers/types";
import { log, sanitizeErrorMessage } from "./log";
import {
  backoffMs,
  claimJob,
  completeJob,
  failJob,
  releaseJob,
  renewLease,
  retryJobLater,
  type ClaimedJob,
} from "./queue";

type InFlight = { job: ClaimedJob; controller: AbortController };

/** Claims and runs jobs one at a time per call; `main.ts` drives it from N loops. */
export function createRunner({ config, storage }: { config: WorkerConfig; storage: Storage }) {
  const inFlight = new Map<string, InFlight>();
  const { workerId, leaseMs } = config;

  /** Runs the next due job, if any. Returns false when the queue had nothing to do. */
  async function processNextJob(): Promise<boolean> {
    const job = await claimJob(workerId, leaseMs);
    if (!job) return false;

    const handler = handlers[job.type] as JobHandler<unknown>;
    const controller = new AbortController();
    inFlight.set(job.id, { job, controller });
    const fields = { jobId: job.id, projectId: job.projectId, type: job.type, attempt: job.attempts };
    const startedAt = Date.now();
    log.info("job.started", fields);

    const heartbeat = setInterval(() => {
      renewLease(job, workerId, leaseMs)
        .then((renewed) => {
          if (!renewed) controller.abort(new LeaseLostError());
        })
        .catch((error) => log.warn("job.lease_renewal_failed", { ...fields, error: sanitizeErrorMessage(error) }));
    }, leaseMs / 3);

    let payload: unknown;
    try {
      const parsed = jobPayloadSchemas[job.type].safeParse(job.payload);
      if (!parsed.success) throw new JobError("PROCESSING_FAILED", "Invalid job payload", { retryable: false });
      payload = parsed.data;
      // A previous worker crashed during the last allowed attempt.
      if (job.attempts > job.maxAttempts) {
        throw new JobError("PROCESSING_FAILED", "Lease expired on the last attempt", { retryable: false });
      }

      const apply = await handler.run({ job, payload, signal: controller.signal, storage, config });
      controller.signal.throwIfAborted();
      await completeJob(job, workerId, apply);
      log.info("job.succeeded", { ...fields, durationMs: Date.now() - startedAt });
    } catch (error) {
      // An abort (lease lost, shutdown) surfaces as whatever the interrupted step threw; the reason is what matters.
      const cause = controller.signal.aborted ? controller.signal.reason : error;
      await settleFailure(job, handler, payload, cause, { ...fields, durationMs: Date.now() - startedAt });
    } finally {
      clearInterval(heartbeat);
      inFlight.delete(job.id);
    }
    return true;
  }

  async function settleFailure(
    job: ClaimedJob,
    handler: JobHandler<unknown>,
    payload: unknown,
    cause: unknown,
    fields: Record<string, string | number>,
  ) {
    try {
      if (cause instanceof LeaseLostError) {
        log.warn("job.lease_lost", fields);
        return;
      }
      if (cause instanceof ShutdownError) {
        await releaseJob(job, workerId);
        log.info("job.released", fields);
        return;
      }

      const failure = {
        code: cause instanceof JobError ? cause.code : "PROCESSING_FAILED",
        message: sanitizeErrorMessage(cause),
      };
      const retryable = !(cause instanceof JobError) || cause.options.retryable;

      if (retryable && job.attempts < job.maxAttempts) {
        await retryJobLater(job, workerId, failure);
        log.warn("job.retry_scheduled", { ...fields, errorCode: failure.code, error: failure.message, retryInMs: backoffMs(job.attempts) });
        return;
      }

      // Out of attempts on an unexpected error: the user sees a generic server-side failure.
      const code = cause instanceof JobError ? cause.code : "PROCESSING_FAILED";
      await failJob(job, workerId, failure, async (tx) => {
        if (payload !== undefined) await handler.onPermanentFailure(tx, payload, code);
      });
      log.error("job.failed", { ...fields, errorCode: code, error: failure.message });
    } catch (error) {
      // Lease lost while recording the failure, or the database is unreachable: the lease
      // expires and another attempt picks the job up.
      log.error("job.settle_failed", { ...fields, error: sanitizeErrorMessage(error) });
    }
  }

  /** Interrupts every running job; each one is released back to the queue. */
  function interruptAll() {
    for (const { controller } of inFlight.values()) controller.abort(new ShutdownError());
  }

  return { processNextJob, interruptAll, inFlightCount: () => inFlight.size };
}

export type Runner = ReturnType<typeof createRunner>;
