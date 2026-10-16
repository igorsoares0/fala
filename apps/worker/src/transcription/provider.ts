/**
 * Transcription contract (spec §9.1). Swapping providers means writing another
 * implementation of this interface; nothing downstream knows which one ran.
 */

export type RawTranscriptWord = {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
};

export type TranscriptionResult = {
  provider: string;
  /** The model that actually ran, when the provider reports it. */
  model: string | null;
  /** Detected language (ISO 639-1, possibly with a region), or null if unknown. */
  language: string | null;
  languageConfidence: number | null;
  text: string;
  words: RawTranscriptWord[];
};

export interface TranscriptionProvider {
  readonly name: string;
  /** `durationMs` is the video's length, when known. */
  transcribe(input: { audioPath: string; durationMs?: number; language?: string; signal?: AbortSignal }): Promise<TranscriptionResult>;
}

/**
 * `no-speech`: the audio has nothing to transcribe — permanent, the user needs another file.
 * `retryable`: the provider or the network failed — worth another attempt.
 */
export class TranscriptionError extends Error {
  constructor(
    readonly kind: "no-speech" | "retryable",
    message: string,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}
