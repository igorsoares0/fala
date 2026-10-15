import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { storageConfigFromEnv, type StorageConfig } from "@fala/storage";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.preprocess(emptyAsUndefined, z.string().max(64).default(`${os.hostname()}-${process.pid}`)),
  WORKER_CONCURRENCY: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(8).default(1)),
  TEMP_DIR: z.preprocess(emptyAsUndefined, z.string().default(path.join(os.tmpdir(), "fala-worker"))),
  FFMPEG_PATH: z.preprocess(emptyAsUndefined, z.string().default("ffmpeg")),
  FFPROBE_PATH: z.preprocess(emptyAsUndefined, z.string().default("ffprobe")),
});

export type WorkerConfig = {
  workerId: string;
  concurrency: number;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  storage: StorageConfig;
  /** A RUNNING job whose lease lapses becomes claimable again; renewed every leaseMs / 3. */
  leaseMs: number;
  pollIntervalMs: number;
  /** How long a SIGTERM waits for running jobs before releasing them back to the queue. */
  shutdownGraceMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.parse(env);
  return {
    workerId: parsed.WORKER_ID,
    concurrency: parsed.WORKER_CONCURRENCY,
    tempDir: parsed.TEMP_DIR,
    ffmpegPath: parsed.FFMPEG_PATH,
    ffprobePath: parsed.FFPROBE_PATH,
    storage: storageConfigFromEnv(env),
    leaseMs: 60_000,
    pollIntervalMs: 1_000,
    shutdownGraceMs: 25_000,
  };
}
