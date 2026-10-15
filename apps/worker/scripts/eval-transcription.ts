/**
 * Transcription evaluation (spec §9.4). Runs the real provider over the clips in
 * fixtures/eval/manifest.json and prints word error rate (character error rate for
 * languages written without spaces), detected language, model and latency.
 *
 *   npm run eval:transcription            # needs ASSEMBLYAI_API_KEY in .env
 *
 * Manual on purpose: it calls a paid API. Compare runs before switching providers
 * or models, and add real clips (accents, noise, music) to the manifest over time.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { isNoSpaceLanguage } from "@fala/shared";
import { extractAudio } from "../src/media/audio";
import { createAssemblyAiProvider } from "../src/transcription/assemblyai";

const EVAL_DIR = path.resolve(import.meta.dirname, "../../../fixtures/eval");

const manifestSchema = z.object({
  clips: z.array(z.object({ file: z.string(), language: z.string(), reference: z.string() })),
});

/** Lowercase, no punctuation; words — or characters for languages without spaces. */
function tokens(text: string, language: string): string[] {
  const clean = text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ");
  return isNoSpaceLanguage(language) ? [...clean.replace(/\s+/g, "")] : clean.split(/\s+/).filter(Boolean);
}

function editDistance(a: string[], b: string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

async function main() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("Set ASSEMBLYAI_API_KEY in .env to run the evaluation.");
  const provider = createAssemblyAiProvider({ apiKey, baseUrl: process.env.ASSEMBLYAI_BASE_URL || undefined });
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(EVAL_DIR, "manifest.json"), "utf8")));
  const dir = await mkdtemp(path.join(os.tmpdir(), "fala-eval-"));

  const rows = [];
  try {
    for (const clip of manifest.clips) {
      const audioPath = path.join(dir, `${path.parse(clip.file).name}.m4a`);
      await extractAudio(ffmpegPath, path.join(EVAL_DIR, clip.file), audioPath);
      const started = Date.now();
      const result = await provider.transcribe({ audioPath });
      const reference = tokens(clip.reference, clip.language);
      const hypothesis = tokens(result.text, clip.language);
      rows.push({
        clip: clip.file,
        expected: clip.language,
        detected: result.language ?? "?",
        model: result.model ?? "?",
        [isNoSpaceLanguage(clip.language) ? "CER" : "WER"]: `${((editDistance(reference, hypothesis) / reference.length) * 100).toFixed(1)}%`,
        words: result.words.length,
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.table(rows);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
