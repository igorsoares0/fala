"use client";

import { createContext, useContext, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import {
  activeBlockIndex,
  editBlockText,
  mergeWithNext,
  nudgeBlock,
  PRESETS,
  replaceMatches,
  segmentWords,
  splitBlock,
  type CaptionStyle,
  type CaptionTrack,
  type PresetKey,
  type ProjectStyleInput,
} from "@fala/shared";
import { emptyHistory, recordChange, redoChange, undoChange, type History } from "@/lib/editor-history";

/**
 * Editor state (spec §2: Zustand). One store per open editor, created from the
 * server's data. Playback time always comes from the <video> element (see
 * use-video-clock.ts); actions that move playback go through the element.
 *
 * The editable document is { track, presetKey, styleConfig }. Every change to it goes
 * through `change()`, which records an undo step; autosave watches the same fields.
 */

export const PLAYBACK_RATES = [1, 1.25, 1.5, 0.75] as const;

/** Within this long after a block starts, "previous" goes to the block before it. */
const RESTART_WINDOW_MS = 400;

export type EditorInit = {
  projectId: string;
  durationMs: number;
  track: CaptionTrack;
  /** Stored caption-track version; every save must be based on it (optimistic concurrency). */
  version: number;
  style: ProjectStyleInput;
};

export type EditorDocument = { track: CaptionTrack; presetKey: PresetKey; styleConfig: CaptionStyle };

export type Toast = { id: number; message: string; action?: "undo" | "redo" };

export type EditorState = Omit<EditorInit, "style"> &
  EditorDocument & {
    timeMs: number;
    playing: boolean;
    rate: number;
    video: HTMLVideoElement | null;
    selectedId: string | null;
    editingId: string | null;
    findOpen: boolean;
    drawerOpen: boolean;
    history: History<EditorDocument>;
    toast: Toast | null;

    attachVideo: (video: HTMLVideoElement | null) => void;
    reloadSource: () => void;
    setClock: (timeMs: number) => void;
    setPlaying: (playing: boolean) => void;
    seek: (timeMs: number) => void;
    togglePlay: () => void;
    prevBlock: () => void;
    nextBlock: () => void;
    cycleRate: () => void;

    select: (blockId: string | null) => void;
    startEditing: (blockId: string | null) => void;
    applyText: (blockId: string, text: string) => void;
    split: (blockId: string, afterWord: number) => void;
    merge: (blockId: string) => void;
    nudge: (blockId: string, edge: "start" | "end", deltaMs: number) => void;
    replaceAll: (query: string, replacement: string) => number;

    applyPreset: (presetKey: PresetKey) => void;
    updateStyle: (patch: Partial<CaptionStyle>) => void;
    restorePreset: () => void;

    undo: () => void;
    redo: () => void;
    restoreDraft: (document: EditorDocument) => void;
    setVersion: (version: number) => void;

    setFindOpen: (open: boolean) => void;
    setDrawerOpen: (open: boolean) => void;
    showToast: (message: string, action?: Toast["action"]) => void;
    dismissToast: () => void;
  };

export function createEditorStore({ style, ...init }: EditorInit) {
  return createStore<EditorState>()((set, get) => {
    const documentOf = (state: EditorState): EditorDocument => ({
      track: state.track,
      presetKey: state.presetKey,
      styleConfig: state.styleConfig,
    });

    /** Applies an edit to the document and records the previous state as an undo step. */
    const change = (label: string, edit: (document: EditorDocument) => EditorDocument, coalesceKey?: string) => {
      const before = documentOf(get());
      const after = edit(before);
      if (after.track === before.track && after.presetKey === before.presetKey && after.styleConfig === before.styleConfig) {
        return false;
      }
      set({ ...after, history: recordChange(get().history, label, before, Date.now(), coalesceKey) });
      return true;
    };

    const indexOf = (blockId: string) => get().track.blocks.findIndex((block) => block.id === blockId);

    /** New style; when words per block changes, the blocks are re-segmented from the words. */
    const withStyle = (document: EditorDocument, presetKey: PresetKey, styleConfig: CaptionStyle): EditorDocument => {
      if (styleConfig.maxW === document.styleConfig.maxW) return { ...document, presetKey, styleConfig };
      const { durationMs } = get();
      const blocks = segmentWords(document.track.words, {
        maxWords: styleConfig.maxW,
        durationMs,
        language: document.track.language,
      });
      return { track: { ...document.track, blocks }, presetKey, styleConfig };
    };

    let toastId = 0;
    let lastReloadAt = 0;

    return {
      ...init,
      presetKey: style.presetKey,
      styleConfig: style.style,
      timeMs: 0,
      playing: false,
      rate: 1,
      video: null,
      selectedId: null,
      editingId: null,
      findOpen: false,
      drawerOpen: false,
      history: emptyHistory<EditorDocument>(),
      toast: null,

      attachVideo: (video) => {
        // A new element (e.g. after the layout changes) keeps the chosen speed.
        if (video) video.playbackRate = get().rate;
        set({ video });
      },
      reloadSource: () => {
        // The video URL is a signed redirect that expires after an hour: ask for a fresh one,
        // then continue where playback was. At most every 10 s, so a broken file can't loop.
        const { video, projectId, timeMs, playing } = get();
        if (!video || Date.now() - lastReloadAt < 10_000) return;
        lastReloadAt = Date.now();
        video.addEventListener(
          "loadedmetadata",
          () => {
            video.currentTime = timeMs / 1000;
            if (playing) void video.play().catch(() => {});
          },
          { once: true },
        );
        video.src = `/api/projects/${projectId}/source?r=${lastReloadAt}`;
      },
      setClock: (timeMs) => set({ timeMs }),
      setPlaying: (playing) => set({ playing }),

      seek: (timeMs) => {
        const clamped = Math.min(Math.max(0, Math.round(timeMs)), get().durationMs);
        const { video } = get();
        if (video) video.currentTime = clamped / 1000;
        set({ timeMs: clamped });
      },

      togglePlay: () => {
        const { video } = get();
        if (!video) return;
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
      },

      prevBlock: () => {
        const { track, timeMs, seek } = get();
        const blocks = track.blocks;
        const current = activeBlockIndex(blocks, timeMs);
        // Like a music player: first back to the start of the current block, then to the one before.
        if (current >= 0 && timeMs - blocks[current].startMs > RESTART_WINDOW_MS) return seek(blocks[current].startMs);
        const reference = current >= 0 ? blocks[current].startMs : timeMs;
        seek(blocks.findLast((block) => block.startMs < reference)?.startMs ?? 0);
      },

      nextBlock: () => {
        const { track, timeMs, seek } = get();
        const next = track.blocks.find((block) => block.startMs > timeMs + 1);
        if (next) seek(next.startMs);
      },

      cycleRate: () => {
        const { rate, video } = get();
        const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
        const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
        if (video) video.playbackRate = next;
        set({ rate: next });
      },

      select: (blockId) => set({ selectedId: blockId, editingId: blockId === get().editingId ? blockId : null }),
      startEditing: (blockId) => set({ editingId: blockId, selectedId: blockId ?? get().selectedId }),

      applyText: (blockId, text) => {
        const index = indexOf(blockId);
        if (index >= 0) change("text edit", (document) => ({ ...document, track: editBlockText(document.track, index, text) }));
        set({ editingId: null });
      },

      split: (blockId, afterWord) => {
        const index = indexOf(blockId);
        if (index >= 0) change("split block", (document) => ({ ...document, track: splitBlock(document.track, index, afterWord) }));
      },

      merge: (blockId) => {
        const index = indexOf(blockId);
        if (index >= 0) change("merge blocks", (document) => ({ ...document, track: mergeWithNext(document.track, index) }));
      },

      nudge: (blockId, edge, deltaMs) => {
        const index = indexOf(blockId);
        if (index < 0) return;
        const { durationMs } = get();
        const moved = change(
          "timing change",
          (document) => ({ ...document, track: nudgeBlock(document.track, index, edge, deltaMs, durationMs) }),
          `nudge:${blockId}:${edge}`,
        );
        // Moving a start: show the caption from its new start.
        if (moved && edge === "start") get().seek(get().track.blocks[index].startMs + 1);
      },

      replaceAll: (query, replacement) => {
        let count = 0;
        change("replace", (document) => {
          const result = replaceMatches(document.track, query, replacement);
          count = result.count;
          return { ...document, track: result.track };
        });
        if (count > 0) get().showToast(`${count} ${count === 1 ? "word replaced" : "words replaced"} · timing kept`, "undo");
        return count;
      },

      applyPreset: (presetKey) =>
        void change("preset change", (document) => withStyle(document, presetKey, PRESETS[presetKey].style)),
      updateStyle: (patch) =>
        void change(
          "maxW" in patch ? "words per block" : "style change",
          (document) => withStyle(document, document.presetKey, { ...document.styleConfig, ...patch }),
          `style:${Object.keys(patch).join(",")}`,
        ),
      restorePreset: () =>
        void change("restore preset", (document) => withStyle(document, document.presetKey, PRESETS[document.presetKey].style)),

      undo: () => {
        const step = undoChange(get().history, documentOf(get()));
        if (!step) return;
        set({ ...step.state, history: step.history, editingId: null });
        get().showToast(`Undone: ${step.label}`, "redo");
      },
      redo: () => {
        const step = redoChange(get().history, documentOf(get()));
        if (!step) return;
        set({ ...step.state, history: step.history, editingId: null });
        get().showToast(`Redone: ${step.label}`, "undo");
      },

      restoreDraft: (document) => {
        set({ ...document });
        get().showToast("Restored changes that hadn't synced");
      },
      setVersion: (version) => set({ version }),

      setFindOpen: (findOpen) => set({ findOpen }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      showToast: (message, action) => set({ toast: { id: ++toastId, message, action } }),
      dismissToast: () => set({ toast: null }),
    };
  });
}

export type EditorStore = StoreApi<EditorState>;

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorStoreProvider({ init, children }: { init: EditorInit; children: React.ReactNode }) {
  const [store] = useState(() => createEditorStore(init));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor must be used inside <EditorStoreProvider>.");
  return store;
}

/** Subscribe to one slice of the editor state; components re-render only when it changes. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStore(), selector);
}
