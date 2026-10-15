import { useSyncExternalStore } from "react";
import type { AcceptedVideoMimeType, PresignResponse } from "@fala/shared";

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

type Entry = { file: File; mimeType: AcceptedVideoMimeType; xhr?: XMLHttpRequest; onSettled?: () => void };

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

/** Sends `file` for `projectId`: presign → direct PUT to storage → confirm. Never throws. */
export async function startUpload(
  projectId: string,
  file: File,
  mimeType: AcceptedVideoMimeType,
  onSettled?: () => void,
) {
  entries.get(projectId)?.xhr?.abort();
  const entry: Entry = { file, mimeType, onSettled };
  entries.set(projectId, entry);
  // A later startUpload or cancelUpload replaces the entry; this run must then stay quiet.
  const report = (upload: LocalUpload) => {
    if (entries.get(projectId) === entry) update(projectId, upload);
  };
  report({ phase: "uploading", progress: 0 });

  try {
    const presign = await postJson<PresignResponse>(`/api/projects/${projectId}/uploads/presign`, {
      mimeType,
      sizeBytes: file.size,
    });
    if (entries.get(projectId) !== entry) return;
    await putFile(entry, presign.uploadUrl, presign.contentType, report);
    report({ phase: "confirming", progress: 1 });
    await postJson(`/api/projects/${projectId}/uploads/complete`, {});
    // Stays "confirmed" until the refreshed server status takes over.
    report({ phase: "confirmed", progress: 1 });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    report({ phase: "failed", progress: 0, error: error instanceof UploadError ? error.message : GENERIC_ERROR });
  }
  if (entries.get(projectId) === entry) onSettled?.();
}

/** Restarts a failed upload with the same file, if this tab still has it. */
export function retryUpload(projectId: string) {
  const entry = entries.get(projectId);
  if (!entry) return false;
  void startUpload(projectId, entry.file, entry.mimeType, entry.onSettled);
  return true;
}

/** Stops and forgets an upload (e.g. the project was deleted). */
export function cancelUpload(projectId: string) {
  const entry = entries.get(projectId);
  entries.delete(projectId);
  entry?.xhr?.abort();
  update(projectId, null);
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
function putFile(entry: Entry, url: string, contentType: string, report: (upload: LocalUpload) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    entry.xhr = xhr;

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) report({ phase: "uploading", progress: event.loaded / event.total });
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(GENERIC_ERROR)));
    xhr.onerror = () => reject(new UploadError(GENERIC_ERROR));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(entry.file);
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
