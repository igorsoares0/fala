import type { WorkerConfig } from "../config";
import { createAssemblyAiProvider } from "./assemblyai";
import { createFakeProvider } from "./fake";
import type { TranscriptionProvider } from "./provider";

export function createTranscriptionProvider(config: WorkerConfig["transcription"]): TranscriptionProvider {
  return config.provider === "fake"
    ? createFakeProvider()
    : createAssemblyAiProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
}

export { TranscriptionError, type TranscriptionProvider, type TranscriptionResult } from "./provider";
