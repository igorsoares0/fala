import { useEffect } from "react";
import {
  captionTrackSchema,
  clampTrim,
  frameSchema,
  normalizeFrame,
  projectStyleInputSchema,
  trimSchema,
  type CaptionTrack,
  type Frame,
  type Trim,
} from "@fala/shared";
import { saveCaptionsAction } from "@/lib/caption-actions";
import { saveFrameAction } from "@/lib/frame-actions";
import { useSaveStatus, type SaveEntry, type SaveSource } from "@/lib/save-status";
import { saveProjectStyleAction } from "@/lib/style-actions";
import { saveTrimAction } from "@/lib/trim-actions";
import { useEditorStore, type EditorDocument, type EditorState, type EditorStore } from "./editor-store";

/**
 * Autosave (handoff "Autosave", FR-07). Four channels — style, captions, trim and frame — each
 * debounced and serialized: one request in flight, and whatever changed meanwhile is
 * sent next, so an older save never lands last.
 *
 * Every unsaved change is also written to localStorage, so closing the tab or losing
 * the connection never loses work: offline changes are retried with backoff and when
 * the browser comes back online, and a draft left behind is restored on the next visit.
 */

const STYLE_DEBOUNCE_MS = 600;
const CAPTIONS_DEBOUNCE_MS = 900;
const TRIM_DEBOUNCE_MS = 600;
const FRAME_DEBOUNCE_MS = 600;
const MAX_RETRY_DELAY_MS = 30_000;
/** How long an export waits for pending edits to reach the server. */
const FLUSH_TIMEOUT_MS = 20_000;

type Outcome =
  | { kind: "saved" }
  /** The server already had this exact save (its response was lost); the version was adopted — save the latest now. */
  | { kind: "rebased" }
  | { kind: "offline" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

/** The document fields a channel saves, compared by reference to skip saves that would change nothing. */
type Snapshot = readonly unknown[];

const sameSnapshot = (a: Snapshot, b: Snapshot) => a.length === b.length && a.every((value, index) => value === b[index]);

type Channel = {
  schedule: () => void;
  flushNow: () => void;
  /** True while this channel holds changes the server doesn't have yet. */
  isDirty: () => boolean;
  /** Saving stopped on offline, an error or a conflict: waiting won't make it "saved". */
  isStuck: () => boolean;
  dispose: () => void;
};

function createChannel({
  source,
  debounceMs,
  snapshot,
  send,
  report,
  onSettled,
}: {
  source: SaveSource;
  debounceMs: number;
  snapshot: () => Snapshot;
  send: () => Promise<Outcome>;
  report: (source: SaveSource, entry: SaveEntry) => void;
  onSettled: () => void;
}): Channel {
  // What the server is known to have. Starts as the document the editor loaded.
  let lastSaved = snapshot();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let pending = false;
  let failures = 0;
  let last: Outcome["kind"] = "saved";
  let disposed = false;

  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    clearTimeout(retryTimer);
    if (inFlight) {
      pending = true;
      return;
    }
    if (last === "conflict") return;
    const sending = snapshot();
    // Nothing new since the last confirmed save (e.g. a retry and the "online" event both fired).
    if (sameSnapshot(sending, lastSaved)) {
      last = "saved";
      failures = 0;
      report(source, { state: "saved" });
      onSettled();
      return;
    }
    inFlight = true;
    pending = false;
    report(source, { state: "saving" });
    const outcome = await send().catch((): Outcome => (navigator.onLine ? { kind: "error", message: "Couldn't reach the server." } : { kind: "offline" }));
    inFlight = false;
    if (disposed) return;
    if (outcome.kind === "saved" || outcome.kind === "rebased") lastSaved = sending;
    last = outcome.kind === "rebased" ? "saved" : outcome.kind;
    if (outcome.kind === "rebased" || (pending && outcome.kind === "saved")) return void flush();

    if (outcome.kind === "saved") {
      failures = 0;
      report(source, { state: "saved" });
    } else if (outcome.kind === "conflict") {
      report(source, {
        state: "conflict",
        error: "These captions were changed in another tab. Reload to see the latest version.",
        retry: () => window.location.reload(),
      });
    } else {
      failures += 1;
      const retry = () => void flush();
      report(source, outcome.kind === "offline" ? { state: "offline", retry } : { state: "error", error: outcome.message, retry });
      retryTimer = setTimeout(retry, Math.min(2_000 * 2 ** (failures - 1), MAX_RETRY_DELAY_MS));
    }
    onSettled();
  }

  const onOnline = () => {
    if (last === "offline" || last === "error") void flush();
  };
  window.addEventListener("online", onOnline);

  return {
    schedule: () => {
      if (last === "conflict") return;
      report(source, { state: "saving" });
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
    flushNow: () => void flush(),
    isDirty: () => timer !== undefined || inFlight || pending || last !== "saved",
    isStuck: () => !inFlight && (last === "offline" || last === "error" || last === "conflict"),
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
    },
  };
}

/** Field-by-field equality of two caption documents (key order and absent optional fields don't matter). */
function sameCaptions(a: Pick<CaptionTrack, "words" | "blocks">, b: Pick<CaptionTrack, "words" | "blocks">): boolean {
  return (
    a.words.length === b.words.length &&
    a.blocks.length === b.blocks.length &&
    a.words.every((word, i) => {
      const other = b.words[i];
      return word.text === other.text && word.startMs === other.startMs && word.endMs === other.endMs && word.confidence === other.confidence;
    }) &&
    a.blocks.every((block, i) => {
      const other = b.blocks[i];
      return (
        block.id === other.id &&
        block.wordStart === other.wordStart &&
        block.wordEnd === other.wordEnd &&
        block.startMs === other.startMs &&
        block.endMs === other.endMs &&
        Boolean(block.realign) === Boolean(other.realign)
      );
    })
  );
}

// ---- Drafts in localStorage ------------------------------------------------------------

/** `trim` and `frame` are missing in drafts written before those existed. */
type Draft = Omit<EditorDocument, "trim" | "frame"> & { trim?: Trim; frame?: Frame; baseVersion: number };

const draftKey = (projectId: string) => `fala:editor-draft:${projectId}`;

function writeDraft(state: EditorState) {
  const draft: Draft = {
    baseVersion: state.version,
    track: state.track,
    presetKey: state.presetKey,
    styleConfig: state.styleConfig,
    trim: state.trim,
    frame: state.frame,
  };
  try {
    localStorage.setItem(draftKey(state.projectId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: autosave still works while online.
  }
}

function clearDraft(projectId: string) {
  try {
    localStorage.removeItem(draftKey(projectId));
  } catch {}
}

/**
 * A draft saved on top of the version the server still has, or null (missing, invalid or
 * outdated). `current` is what the server has, kept for whatever the draft doesn't carry.
 */
export function readDraft(
  projectId: string,
  serverVersion: number,
  current: { trim: Trim; frame: Frame; durationMs: number },
): EditorDocument | null {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(draftKey(projectId)) ?? "null");
  } catch {
    return null;
  }
  const draft = raw as Partial<Draft> | null;
  const track = captionTrackSchema.safeParse(draft?.track);
  const style = projectStyleInputSchema.safeParse({ presetKey: draft?.presetKey, style: draft?.styleConfig });
  if (!draft || draft.baseVersion !== serverVersion || !track.success || !style.success) {
    clearDraft(projectId);
    return null;
  }
  const trim = trimSchema.safeParse(draft.trim);
  const frame = frameSchema.safeParse(draft.frame);
  return {
    track: track.data,
    presetKey: style.data.presetKey,
    styleConfig: style.data.style,
    trim: trim.success ? clampTrim(trim.data, current.durationMs) : current.trim,
    frame: frame.success ? normalizeFrame(frame.data) : current.frame,
  };
}

// ---- The hook ------------------------------------------------------------------------------

export function useAutosave() {
  const store = useEditorStore();
  const report = useSaveStatus((status) => status.report);

  useEffect(() => {
    const state = () => store.getState();

    const style: Channel = createChannel({
      source: "style",
      debounceMs: STYLE_DEBOUNCE_MS,
      report,
      onSettled: () => settle(),
      snapshot: () => [state().presetKey, state().styleConfig],
      send: async () => {
        const { projectId, presetKey, styleConfig } = state();
        const result = await saveProjectStyleAction(projectId, { presetKey, style: styleConfig });
        return result.ok ? { kind: "saved" } : { kind: "error", message: result.error };
      },
    });

    const captions: Channel = createChannel({
      source: "captions",
      debounceMs: CAPTIONS_DEBOUNCE_MS,
      report,
      onSettled: () => settle(),
      snapshot: () => [state().track],
      send: async () => {
        const { projectId, version, track, setVersion } = state();
        const result = await saveCaptionsAction(projectId, { baseVersion: version, words: track.words, blocks: track.blocks });
        if (result.ok) {
          setVersion(result.version);
          return { kind: "saved" };
        }
        if (!result.conflict) return { kind: "error", message: result.error };
        // Our own earlier save landed but its response was lost: same content, newer version.
        if (result.version !== null && result.current && sameCaptions(result.current, track)) {
          setVersion(result.version);
          return { kind: "rebased" };
        }
        return { kind: "conflict" };
      },
    });

    const trim: Channel = createChannel({
      source: "trim",
      debounceMs: TRIM_DEBOUNCE_MS,
      report,
      onSettled: () => settle(),
      snapshot: () => [state().trim],
      send: async () => {
        const { projectId, trim: range } = state();
        const result = await saveTrimAction(projectId, range);
        return result.ok ? { kind: "saved" } : { kind: "error", message: result.error };
      },
    });

    const frame: Channel = createChannel({
      source: "frame",
      debounceMs: FRAME_DEBOUNCE_MS,
      report,
      onSettled: () => settle(),
      snapshot: () => [state().frame],
      send: async () => {
        const { projectId, frame: shape } = state();
        const result = await saveFrameAction(projectId, shape);
        return result.ok ? { kind: "saved" } : { kind: "error", message: result.error };
      },
    });

    const channels = [style, captions, trim, frame];

    /** Keep the local draft in step: gone once everything is saved, current otherwise. */
    function settle() {
      if (channels.some((channel) => channel.isDirty())) writeDraft(state());
      else clearDraft(state().projectId);
    }

    // Before an export freezes the project: send everything now and wait for the server to have it.
    store.setState({
      flushSaves: async () => {
        for (const channel of channels) channel.flushNow();
        const deadline = Date.now() + FLUSH_TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (channels.some((channel) => channel.isStuck())) return false;
          if (!channels.some((channel) => channel.isDirty())) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      },
    });

    const unsubscribe = (store as EditorStore).subscribe((next, previous) => {
      const trackChanged = next.track !== previous.track;
      const styleChanged = next.presetKey !== previous.presetKey || next.styleConfig !== previous.styleConfig;
      const trimChanged = next.trim !== previous.trim;
      if (trackChanged) captions.schedule();
      if (styleChanged) style.schedule();
      const frameChanged = next.frame !== previous.frame;
      if (trimChanged) trim.schedule();
      if (frameChanged) frame.schedule();
      if (trackChanged || styleChanged || trimChanged || frameChanged) writeDraft(next);
    });

    // Leaving with unsynced work: let the browser ask (the draft survives either way).
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const entries = useSaveStatus.getState().entries;
      if (Object.values(entries).some((entry) => entry.state === "offline" || entry.state === "error")) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      store.setState({ flushSaves: async () => true });
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Navigating away inside the app with a change still waiting: send it now.
      for (const channel of channels) {
        if (channel.isDirty()) channel.flushNow();
        channel.dispose();
      }
    };
  }, [store, report]);
}
