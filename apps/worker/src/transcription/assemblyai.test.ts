import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAssemblyAiProvider } from "./assemblyai";
import { TranscriptionError } from "./provider";

let dir: string;
let audioPath: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fala-aai-"));
  audioPath = path.join(dir, "audio.m4a");
  await writeFile(audioPath, "fake audio bytes");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** A scripted AssemblyAI: answers each request with the next queued response for its route. */
function stubApi(transcriptStates: object[], options: { uploadStatus?: number } = {}) {
  const calls: Call[] = [];
  const states = [...transcriptStates];
  const fetchStub: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ? "<binary>" : undefined;
    calls.push({ method, url, headers, body });

    if (url.endsWith("/v2/upload")) {
      return options.uploadStatus
        ? new Response("nope", { status: options.uploadStatus })
        : Response.json({ upload_url: "https://cdn.assemblyai.example/upload/abc" });
    }
    if (method === "DELETE") return Response.json({ id: "t1", status: "completed" });
    return Response.json(states.length > 1 ? states.shift() : states[0]);
  };
  return { calls, fetch: fetchStub };
}

const completed = {
  id: "t1",
  status: "completed",
  text: "Olá mundo.",
  language_code: "pt",
  language_confidence: 0.97,
  speech_model_used: "universal-3-5-pro",
  words: [
    { text: "Olá", start: 120, end: 480, confidence: 0.98 },
    { text: "mundo.", start: 500, end: 910, confidence: 0.91 },
  ],
};

const provider = (api: ReturnType<typeof stubApi>) =>
  createAssemblyAiProvider({ apiKey: "secret-key", fetch: api.fetch, pollIntervalMs: 1 });

describe("AssemblyAI provider", () => {
  it("uploads, submits with language detection, polls until done and maps the words", async () => {
    const api = stubApi([{ id: "t1", status: "queued" }, { id: "t1", status: "processing" }, completed]);

    const result = await provider(api).transcribe({ audioPath });

    expect(result).toEqual({
      provider: "assemblyai",
      model: "universal-3-5-pro",
      language: "pt",
      languageConfidence: 0.97,
      text: "Olá mundo.",
      words: [
        { text: "Olá", startMs: 120, endMs: 480, confidence: 0.98 },
        { text: "mundo.", startMs: 500, endMs: 910, confidence: 0.91 },
      ],
    });

    const [upload, submit] = api.calls;
    expect(upload).toMatchObject({ method: "POST", url: "https://api.assemblyai.com/v2/upload", body: "<binary>" });
    expect(upload.headers.authorization).toBe("secret-key");
    expect(submit).toMatchObject({
      method: "POST",
      url: "https://api.assemblyai.com/v2/transcript",
      body: {
        audio_url: "https://cdn.assemblyai.example/upload/abc",
        speech_models: ["universal-3-5-pro", "universal-2"],
        language_detection: true,
      },
    });
    expect(api.calls.filter((call) => call.method === "GET").length).toBeGreaterThanOrEqual(2);
  });

  it("always deletes the transcript at AssemblyAI afterwards", async () => {
    const api = stubApi([completed]);
    await provider(api).transcribe({ audioPath });
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", url: "https://api.assemblyai.com/v2/transcript/t1" });

    const failing = stubApi([{ id: "t1", status: "error", error: "Internal server error" }]);
    await expect(provider(failing).transcribe({ audioPath })).rejects.toBeInstanceOf(TranscriptionError);
    expect(failing.calls.at(-1)).toMatchObject({ method: "DELETE" });
  });

  it("reports silent audio as no-speech, permanently", async () => {
    const noSpoken = stubApi([
      { id: "t1", status: "error", error: "language_detection cannot be performed on files with no spoken audio." },
    ]);
    await expect(provider(noSpoken).transcribe({ audioPath })).rejects.toMatchObject({ kind: "no-speech" });

    const noWords = stubApi([{ ...completed, text: "", words: [] }]);
    await expect(provider(noWords).transcribe({ audioPath })).rejects.toMatchObject({ kind: "no-speech" });
  });

  it("treats HTTP and network failures as retryable, without leaking the key", async () => {
    const api = stubApi([completed], { uploadStatus: 503 });
    const error = await provider(api).transcribe({ audioPath }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "retryable" });
    expect(String((error as Error).message)).not.toContain("secret-key");

    const offline = createAssemblyAiProvider({
      apiKey: "secret-key",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(offline.transcribe({ audioPath })).rejects.toMatchObject({ kind: "retryable" });
  });

  it("sends a known language instead of detecting it", async () => {
    const api = stubApi([completed]);
    await provider(api).transcribe({ audioPath, language: "es" });
    expect(api.calls[1].body).toMatchObject({ language_code: "es" });
    expect(api.calls[1].body).not.toHaveProperty("language_detection");
  });

  it("stops polling when the job is aborted", async () => {
    const api = stubApi([{ id: "t1", status: "processing" }]);
    const controller = new AbortController();
    const slow = createAssemblyAiProvider({ apiKey: "k", fetch: api.fetch, pollIntervalMs: 50 });
    const pending = slow.transcribe({ audioPath, signal: controller.signal });
    setTimeout(() => controller.abort(), 120);
    await expect(pending).rejects.toThrow();
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE" });
  });
});
