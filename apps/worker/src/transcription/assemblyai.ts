import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { TranscriptionError, type TranscriptionProvider, type TranscriptionResult } from "./provider";

/**
 * AssemblyAI (https://www.assemblyai.com/docs). Flow: upload the audio, submit a
 * transcript with automatic language detection, poll until it settles, then delete
 * it so neither the audio nor the text stays with the vendor.
 *
 * Model routing is AssemblyAI's default: Universal-3.5 Pro for the languages it
 * covers, Universal-2 (99 languages) for the rest.
 */

export type AssemblyAiOptions = {
  apiKey: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://api.assemblyai.com";
const SPEECH_MODELS = ["universal-3-5-pro", "universal-2"];

const transcriptSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "processing", "completed", "error"]),
  error: z.string().nullish(),
  text: z.string().nullish(),
  language_code: z.string().nullish(),
  language_confidence: z.number().nullish(),
  speech_model_used: z.string().nullish(),
  words: z
    .array(z.object({ text: z.string(), start: z.number(), end: z.number(), confidence: z.number().nullish() }))
    .nullish(),
});

/** Error texts AssemblyAI uses when a file has no spoken audio. */
const NO_SPEECH_ERROR = /no spoken audio|does not appear to contain audio|no speech/i;

export function createAssemblyAiProvider(options: AssemblyAiOptions): TranscriptionProvider {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;

  async function call(path: string, init: RequestInit & { signal?: AbortSignal }) {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { authorization: options.apiKey, ...init.headers },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new TranscriptionError("retryable", `AssemblyAI request failed: ${(error as Error).message}`);
    }
    if (!response.ok) {
      // Auth and quota problems are configuration issues: retrying later may succeed once fixed.
      throw new TranscriptionError("retryable", `AssemblyAI ${init.method ?? "GET"} ${path.split("/").slice(0, 3).join("/")} returned ${response.status}`);
    }
    return response;
  }

  return {
    name: "assemblyai",

    async transcribe({ audioPath, language, signal }): Promise<TranscriptionResult> {
      const audio = await readFile(audioPath);
      const upload = z
        .object({ upload_url: z.string() })
        .parse(
          await (
            await call("/v2/upload", {
              method: "POST",
              headers: { "content-type": "application/octet-stream" },
              body: audio,
              signal,
            })
          ).json(),
        );

      const submitted = transcriptSchema.parse(
        await (
          await call("/v2/transcript", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              audio_url: upload.upload_url,
              speech_models: SPEECH_MODELS,
              ...(language ? { language_code: language } : { language_detection: true }),
              punctuate: true,
              format_text: true,
            }),
            signal,
          })
        ).json(),
      );

      try {
        const deadline = Date.now() + timeoutMs;
        let transcript = submitted;
        while (transcript.status === "queued" || transcript.status === "processing") {
          if (Date.now() > deadline) throw new TranscriptionError("retryable", "AssemblyAI took too long");
          await sleep(pollIntervalMs, undefined, { signal });
          transcript = transcriptSchema.parse(await (await call(`/v2/transcript/${submitted.id}`, { signal })).json());
        }

        if (transcript.status === "error") {
          const message = transcript.error ?? "unknown error";
          throw new TranscriptionError(NO_SPEECH_ERROR.test(message) ? "no-speech" : "retryable", `AssemblyAI: ${message}`);
        }

        const words = (transcript.words ?? []).map((word) => ({
          text: word.text,
          startMs: word.start,
          endMs: word.end,
          ...(word.confidence == null ? {} : { confidence: word.confidence }),
        }));
        if (words.length === 0) throw new TranscriptionError("no-speech", "AssemblyAI returned no words");

        return {
          provider: "assemblyai",
          model: transcript.speech_model_used ?? null,
          language: transcript.language_code ?? language ?? null,
          languageConfidence: transcript.language_confidence ?? null,
          text: transcript.text ?? "",
          words,
        };
      } finally {
        // Also removes the uploaded audio. Best effort: a failure here must not fail the job.
        await doFetch(`${baseUrl}/v2/transcript/${submitted.id}`, {
          method: "DELETE",
          headers: { authorization: options.apiKey },
        }).catch(() => undefined);
      }
    },
  };
}
