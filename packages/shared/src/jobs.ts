import { z } from "zod";

/** Background job types handled by the worker (spec §7.3). Later phases add more. */
export const JOB_TYPES = ["VALIDATE_VIDEO", "TRANSCRIBE_VIDEO", "DELETE_PROJECT_ASSETS"] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["PENDING", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "FAILED", "CANCELLED"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const id = z.string().min(1).max(64);

/** Payload schemas, validated when a job is enqueued and again when the worker picks it up. */
export const jobPayloadSchemas = {
  VALIDATE_VIDEO: z.object({ projectId: id, sourceObjectKey: z.string().min(1).max(512) }),
  TRANSCRIBE_VIDEO: z.object({ projectId: id, sourceObjectKey: z.string().min(1).max(512) }),
  DELETE_PROJECT_ASSETS: z.object({ projectId: id, userId: id }),
} satisfies Record<JobType, z.ZodType>;

export type JobPayload<T extends JobType> = z.infer<(typeof jobPayloadSchemas)[T]>;
