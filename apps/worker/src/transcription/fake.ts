import { TranscriptionError, type TranscriptionProvider, type TranscriptionResult } from "./provider";

const SCRIPT = "It's the rhythm that keeps you watching. Every word lands right on time, so nobody scrolls away.".split(" ");

/**
 * Offline provider for tests and E2E: returns a fixed script spread over the clip,
 * one word every 180 ms. Not for production — real timings come from a real provider.
 */
export function createFakeProvider(
  options: { durationMs?: number; behavior?: "speech" | "silence" | "fail" } = {},
): TranscriptionProvider {
  const behavior = options.behavior ?? "speech";
  return {
    name: "fake",
    async transcribe(): Promise<TranscriptionResult> {
      if (behavior === "fail") throw new TranscriptionError("retryable", "Fake provider failure");
      if (behavior === "silence") throw new TranscriptionError("no-speech", "Fake provider heard nothing");

      const durationMs = options.durationMs ?? 2_000;
      const count = Math.max(1, Math.min(SCRIPT.length, Math.floor(durationMs / 180)));
      const words = SCRIPT.slice(0, count).map((text, index) => ({
        text,
        startMs: index * 180,
        endMs: index * 180 + 150,
        confidence: 0.99,
      }));
      return {
        provider: "fake",
        model: "fake-1",
        language: "en",
        languageConfidence: 1,
        text: words.map((word) => word.text).join(" "),
        words,
      };
    },
  };
}
