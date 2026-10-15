import { create } from "zustand";

/**
 * Save state of everything the editor persists (project name, style, captions), so
 * the header shows one indicator. Only ever changed in the browser.
 *
 * offline: couldn't reach the server — changes are kept in this browser and retried.
 * conflict: another tab saved newer captions — this one must reload.
 */
export type SaveState = "saved" | "saving" | "offline" | "error" | "conflict";
export type SaveSource = "name" | "style" | "captions";

export type SaveEntry = { state: SaveState; retry?: () => void; error?: string };

type SaveStatusStore = {
  entries: Partial<Record<SaveSource, SaveEntry>>;
  report: (source: SaveSource, entry: SaveEntry) => void;
  reset: () => void;
};

export const useSaveStatus = create<SaveStatusStore>((set) => ({
  entries: {},
  report: (source, entry) => set((store) => ({ entries: { ...store.entries, [source]: entry } })),
  reset: () => set({ entries: {} }),
}));

const PRIORITY: SaveState[] = ["conflict", "error", "offline", "saving"];

/** The most serious state wins: conflict, error, offline, saving, then saved. */
export function combineSaveStatus(entries: Partial<Record<SaveSource, SaveEntry>>): SaveEntry {
  const all = Object.values(entries);
  for (const state of PRIORITY) {
    const match = all.find((entry) => entry.state === state);
    if (match) return match;
  }
  return { state: "saved" };
}

/** Changes exist that the server doesn't have and won't get without help. */
export function hasUnsyncedChanges(entries: Partial<Record<SaveSource, SaveEntry>>): boolean {
  return Object.values(entries).some((entry) => entry.state === "offline" || entry.state === "error" || entry.state === "conflict");
}
