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
  TRANSCRIPTION_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(["assemblyai", "fake"]).default("assemblyai")),
  ASSEMBLYAI_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  ASSEMBLYAI_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  NODE_ENV: z.string().optional(),
});

export type WorkerConfig = {
  workerId: string;
  concurrency: number;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  storage: StorageConfig;
  transcription:
    | { provider: "assemblyai"; apiKey: string; baseUrl?: string }
    | { provider: "fake" };
  /** A RUNNING job whose lease lapses becomes claimable again; renewed every leaseMs / 3. */
  leaseMs: number;
  pollIntervalMs: number;
  /** How long a SIGTERM waits for running jobs before releasing them back to the queue. */
  shutdownGraceMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.parse(env);
  return {
    transcription: transcriptionConfig(parsed),
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

function transcriptionConfig(env: z.infer<typeof envSchema>): WorkerConfig["transcription"] {
  if (env.TRANSCRIPTION_PROVIDER === "fake") {
    // The fake provider invents captions; it must never run for real users.
    if (env.NODE_ENV === "production") throw new Error("TRANSCRIPTION_PROVIDER=fake is not allowed in production.");
    return { provider: "fake" };
  }
  if (!env.ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY is not set (or use TRANSCRIPTION_PROVIDER=fake locally).");
  return { provider: "assemblyai", apiKey: env.ASSEMBLYAI_API_KEY, baseUrl: env.ASSEMBLYAI_BASE_URL };
}
