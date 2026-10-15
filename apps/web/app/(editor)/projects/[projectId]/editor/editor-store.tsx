"use client";

import { createContext, useContext, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import {
  activeBlockIndex,
  PRESETS,
  segmentWords,
  type CaptionStyle,
  type CaptionTrack,
  type PresetKey,
  type ProjectStyleInput,
} from "@fala/shared";

/**
 * Editor state (spec §2: Zustand). One store per open editor, created from the
 * server's data. Playback time always comes from the <video> element (see
 * use-video-clock.ts); actions that move playback go through the element.
 */

export const PLAYBACK_RATES = [1, 1.25, 1.5, 0.75] as const;

/** Within this long after a block starts, "previous" goes to the block before it. */
const RESTART_WINDOW_MS = 400;

export type EditorInit = {
  projectId: string;
  durationMs: number;
  track: CaptionTrack;
  style: ProjectStyleInput;
};

export type EditorState = EditorInit & {
  presetKey: PresetKey;
  styleConfig: CaptionStyle;
  timeMs: number;
  playing: boolean;
  rate: number;
  video: HTMLVideoElement | null;

  attachVideo: (video: HTMLVideoElement | null) => void;
  setClock: (timeMs: number) => void;
  setPlaying: (playing: boolean) => void;
  seek: (timeMs: number) => void;
  togglePlay: () => void;
  prevBlock: () => void;
  nextBlock: () => void;
  cycleRate: () => void;
  applyPreset: (presetKey: PresetKey) => void;
  updateStyle: (patch: Partial<CaptionStyle>) => void;
  restorePreset: () => void;
};

export function createEditorStore(init: EditorInit) {
  return createStore<EditorState>()((set, get) => {
    /** New style; when words per block changes, the blocks are re-segmented from the words. */
    const setStyle = (presetKey: PresetKey, styleConfig: CaptionStyle) => {
      const { track, durationMs, styleConfig: previous } = get();
      const blocks =
        styleConfig.maxW === previous.maxW
          ? track.blocks
          : segmentWords(track.words, { maxWords: styleConfig.maxW, durationMs, language: track.language });
      set({ presetKey, styleConfig, track: { ...track, blocks } });
    };

    return {
      ...init,
      presetKey: init.style.presetKey,
      styleConfig: init.style.style,
      timeMs: 0,
      playing: false,
      rate: 1,
      video: null,

      attachVideo: (video) => {
        // A new element (e.g. after the layout changes) keeps the chosen speed.
        if (video) video.playbackRate = get().rate;
        set({ video });
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

      applyPreset: (presetKey) => setStyle(presetKey, PRESETS[presetKey].style),
      updateStyle: (patch) => setStyle(get().presetKey, { ...get().styleConfig, ...patch }),
      restorePreset: () => setStyle(get().presetKey, PRESETS[get().presetKey].style),
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
