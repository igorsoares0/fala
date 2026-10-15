import type { ProjectErrorCode } from "@fala/shared";

/**
 * A failure with a known cause. `retryable: false` means repeating the job can't
 * help (an invalid file), so it fails right away instead of using up retries.
 */
export class JobError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    message: string,
    readonly options: { retryable: boolean },
  ) {
    super(message);
    this.name = "JobError";
  }
}

/** The job's lease was taken over by another worker; this worker must not publish anything. */
export class LeaseLostError extends Error {
  constructor() {
    super("Lease lost");
    this.name = "LeaseLostError";
  }
}

/** The worker is shutting down; the job goes back to the queue untouched. */
export class ShutdownError extends Error {
  constructor() {
    super("Worker shutting down");
    this.name = "ShutdownError";
  }
}
