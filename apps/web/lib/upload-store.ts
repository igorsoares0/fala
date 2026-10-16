import { useSyncExternalStore } from "react";
import type { AcceptedVideoMimeType, PresignResponse, UploadPartsResponse } from "@fala/shared";

/**
 * Uploads running in this tab, keyed by project id. Module state (not React state)
 * so an upload keeps going — and keeps reporting progress — while the user moves
 * between the dashboard and the editor. The server stays the source of truth for
 * everything after the bytes arrive.
 */

export type LocalUpload = {
  phase: "uploading" | "confirming" | "confirmed" | "failed";
  /** 0–1 share of bytes sent. */
  progress: number;
  error?: string;
};

type Entry = {
  file: File;
  mimeType: AcceptedVideoMimeType;
  onSettled?: () => void;
  /** Set once the server has started the multipart upload; kept so "Try again" can resume it. */
  plan?: { partSize: number; partCount: number };
  /** Parts the storage has acknowledged. */
  done: Set<number>;
  /** Bytes sent so far of each part in flight (for progress). */
  inFlight: Map<number, number>;
  requests: Set<XMLHttpRequest>;
  cancelled: boolean;
};

const entries = new Map<string, Entry>();
let snapshot: ReadonlyMap<string, LocalUpload> = new Map();
const listeners = new Set<() => void>();

function update(projectId: string, upload: LocalUpload | null) {
  const next = new Map(snapshot);
  if (upload) next.set(projectId, upload);
  else next.delete(projectId);
  snapshot = next;
  syncLeaveWarning();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocalUpload(projectId: string): LocalUpload | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(projectId),
    () => undefined,
  );
}

const NO_UPLOADS: ReadonlyMap<string, LocalUpload> = new Map();

/** Every upload in this tab, for views that cover several projects. */
export function useLocalUploads(): ReadonlyMap<string, LocalUpload> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => NO_UPLOADS,
  );
}

const GENERIC_ERROR = "The upload stopped. Check your connection and try again.";

/** Parts sent at once: enough to fill most connections, few enough to keep each one fast. */
const PARALLEL_PARTS = 4;
const PART_ATTEMPTS = 6;
const URL_BATCH = 20;

/**
 * Sends `file` for `projectId`: start → PUT each part straight to storage → confirm.
 * A part that fails is retried on its own (waiting for the connection to come back
 * when the browser is offline), so a blip never restarts a multi-GB upload. Never throws.
 */
export async function startUpload(
  projectId: string,
  file: File,
  mimeType: AcceptedVideoMimeType,
  onSettled?: () => void,
) {
  stop(entries.get(projectId));
  await run(projectId, { file, mimeType, onSettled, done: new Set(), inFlight: new Map(), requests: new Set(), cancelled: false });
}

/** Retries a failed upload with the same file, if this tab still has it — resuming its parts when possible. */
export function retryUpload(projectId: string) {
  const previous = entries.get(projectId);
  if (!previous) return false;
  stop(previous);
  void run(projectId, { ...previous, inFlight: new Map(), requests: new Set(), cancelled: false });
  return true;
}

/** Stops and forgets an upload (e.g. the project was deleted). */
export function cancelUpload(projectId: string) {
  const entry = entries.get(projectId);
  entries.delete(projectId);
  stop(entry);
  update(projectId, null);
}

function stop(entry: Entry | undefined) {
  if (!entry) return;
  entry.cancelled = true;
  for (const request of entry.requests) request.abort();
}

async function run(projectId: string, entry: Entry) {
  entries.set(projectId, entry);
  // A later start, retry or cancel replaces the entry; this run must then stay quiet.
  const current = () => entries.get(projectId) === entry && !entry.cancelled;
  const report = (upload: LocalUpload) => {
    if (current()) update(projectId, upload);
  };
  const progress = () => {
    const { plan, file } = entry;
    if (!plan) return 0;
    let sent = 0;
    for (const part of entry.done) sent += partBounds(plan.partSize, file.size, part).size;
    for (const bytes of entry.inFlight.values()) sent += bytes;
    return Math.min(1, sent / file.size);
  };
  report({ phase: "uploading", progress: progress() });

  try {
    let resumed = false;
    if (entry.plan) {
      // Resume: only when the server still has this upload open (its part URLs can still be signed).
      const missing = missingParts(entry);
      resumed = missing.length === 0 || (await signParts(projectId, missing.slice(0, 1)).then(() => true, () => false));
    }
    if (!resumed) {
      entry.done = new Set();
      entry.plan = await postJson<PresignResponse>(`/api/projects/${projectId}/uploads/presign`, {
        mimeType: entry.mimeType,
        sizeBytes: entry.file.size,
      });
    }
    if (!current()) return;

    await sendParts(projectId, entry, () => report({ phase: "uploading", progress: progress() }));
    if (!current()) return;
    report({ phase: "confirming", progress: 1 });
    await postJson(`/api/projects/${projectId}/uploads/complete`, {});
    // Stays "confirmed" until the refreshed server status takes over.
    report({ phase: "confirmed", progress: 1 });
  } catch (error) {
    if (!current() || (error instanceof DOMException && error.name === "AbortError")) return;
    report({ phase: "failed", progress: 0, error: error instanceof UploadError ? error.message : GENERIC_ERROR });
  }
  if (current()) entry.onSettled?.();
}

function missingParts(entry: Entry): number[] {
  const parts: number[] = [];
  for (let part = 1; part <= (entry.plan?.partCount ?? 0); part++) if (!entry.done.has(part)) parts.push(part);
  return parts;
}

function partBounds(partSize: number, fileSize: number, partNumber: number) {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(fileSize, start + partSize);
  return { start, end, size: end - start };
}

/** PUTs every missing part, PARALLEL_PARTS at a time, signing URLs in batches as it goes. */
async function sendParts(projectId: string, entry: Entry, onProgress: () => void) {
  const queue = missingParts(entry);
  const urls = new Map<number, string>();
  let signing: Promise<void> | null = null;

  const urlFor = async (part: number): Promise<string> => {
    while (!urls.has(part)) {
      signing ??= signParts(projectId, [part, ...queue.filter((next) => !urls.has(next) && next !== part)].slice(0, URL_BATCH))
        .then((signed) => signed.forEach(({ partNumber, url }) => urls.set(partNumber, url)))
        .finally(() => (signing = null));
      await signing;
    }
    return urls.get(part)!;
  };

  const worker = async () => {
    while (queue.length > 0) {
      if (entry.cancelled) throw new DOMException("Upload cancelled", "AbortError");
      const part = queue.shift()!;
      for (let attempt = 1; ; attempt++) {
        try {
          await putPart(entry, part, await urlFor(part), onProgress);
          entry.done.add(part);
          onProgress();
          break;
        } catch (error) {
          entry.inFlight.delete(part);
          if (entry.cancelled || (error instanceof DOMException && error.name === "AbortError")) throw error;
          if (attempt >= PART_ATTEMPTS) throw new UploadError(GENERIC_ERROR);
          // A signed URL may have expired: sign this part again on the next attempt.
          urls.delete(part);
          await waitBeforeRetry(attempt);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, queue.length) }, worker));
}

async function signParts(projectId: string, partNumbers: number[]) {
  return (await postJson<UploadPartsResponse>(`/api/projects/${projectId}/uploads/parts`, { partNumbers })).urls;
}

/** Backoff (1 s, 2 s, 4 s…); while offline, waits for the connection to come back instead. */
function waitBeforeRetry(attempt: number) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return new Promise<void>((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
  }
  return new Promise<void>((resolve) => setTimeout(resolve, Math.min(16_000, 1_000 * 2 ** (attempt - 1))));
}

class UploadError extends Error {}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new UploadError(json?.error ?? GENERIC_ERROR);
  return json as T;
}

/** XMLHttpRequest rather than fetch: it reports upload progress. */
function putPart(entry: Entry, partNumber: number, url: string, onProgress: () => void) {
  const { start, end } = partBounds(entry.plan!.partSize, entry.file.size, partNumber);
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    entry.requests.add(xhr);
    const settle = () => entry.requests.delete(xhr);

    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      entry.inFlight.set(partNumber, event.loaded);
      onProgress();
    };
    xhr.onload = () => {
      settle();
      entry.inFlight.delete(partNumber);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError(GENERIC_ERROR));
    };
    xhr.onerror = () => {
      settle();
      reject(new UploadError(GENERIC_ERROR));
    };
    xhr.onabort = () => {
      settle();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    // A Blob slice reads from disk as it's sent: the file is never loaded into memory.
    xhr.send(entry.file.slice(start, end));
  });
}

// Leaving the page would drop the bytes in flight, so ask first.
let warningActive = false;

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  event.preventDefault();
}

function syncLeaveWarning() {
  const busy = [...snapshot.values()].some((upload) => upload.phase === "uploading" || upload.phase === "confirming");
  if (busy === warningActive || typeof window === "undefined") return;
  warningActive = busy;
  if (busy) window.addEventListener("beforeunload", warnBeforeLeaving);
  else window.removeEventListener("beforeunload", warnBeforeLeaving);
}
