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
  CHROMIUM_PATH: z.preprocess(emptyAsUndefined, z.string().optional()),
  TRANSCRIPTION_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(["assemblyai", "fake"]).default("assemblyai")),
  ASSEMBLYAI_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  ASSEMBLYAI_BASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  EMAIL_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(["resend", "log"]).optional()),
  RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyAsUndefined, z.string().default("Supertitle <onboarding@resend.dev>")),
  APP_URL: z.preprocess(emptyAsUndefined, z.url().default("http://localhost:3000")),
  NODE_ENV: z.string().optional(),
});

export type WorkerConfig = {
  workerId: string;
  concurrency: number;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  /** Chromium for drawing caption overlays; Playwright's installed headless shell when unset. */
  chromiumPath?: string;
  storage: StorageConfig;
  transcription:
    | { provider: "assemblyai"; apiKey: string; baseUrl?: string }
    | { provider: "fake" };
  email: { provider: "resend"; apiKey: string; from: string } | { provider: "log"; from: string };
  /** Base of links in emails (the web app). */
  appUrl: string;
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
    email: emailConfig(parsed),
    appUrl: parsed.APP_URL.replace(/\/$/, ""),
    workerId: parsed.WORKER_ID,
    concurrency: parsed.WORKER_CONCURRENCY,
    tempDir: parsed.TEMP_DIR,
    ffmpegPath: parsed.FFMPEG_PATH,
    ffprobePath: parsed.FFPROBE_PATH,
    chromiumPath: parsed.CHROMIUM_PATH,
    storage: storageConfigFromEnv(env),
    leaseMs: 60_000,
    pollIntervalMs: 1_000,
    shutdownGraceMs: 25_000,
  };
}

function emailConfig(env: z.infer<typeof envSchema>): WorkerConfig["email"] {
  const provider = env.EMAIL_PROVIDER ?? (env.RESEND_API_KEY ? "resend" : "log");
  if (provider === "log") {
    // Printing emails is for development only: in production they must really go out.
    if (env.NODE_ENV === "production") throw new Error("Set RESEND_API_KEY (emails can't be logged in production).");
    return { provider: "log", from: env.EMAIL_FROM };
  }
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set.");
  return { provider: "resend", apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
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
