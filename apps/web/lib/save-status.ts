import { create } from "zustand";

/**
 * Save state of everything the editor persists (project name, style; captions in 4b),
 * so the header shows one indicator. Only ever changed in the browser.
 */
export type SaveState = "saved" | "saving" | "error";
export type SaveSource = "name" | "style";

type Entry = { state: SaveState; retry?: () => void; error?: string };

type SaveStatusStore = {
  entries: Partial<Record<SaveSource, Entry>>;
  report: (source: SaveSource, entry: Entry) => void;
  reset: () => void;
};

export const useSaveStatus = create<SaveStatusStore>((set) => ({
  entries: {},
  report: (source, entry) => set((store) => ({ entries: { ...store.entries, [source]: entry } })),
  reset: () => set({ entries: {} }),
}));

/** An error wins over saving, which wins over saved. */
export function combineSaveStatus(entries: Partial<Record<SaveSource, Entry>>): Entry {
  const all = Object.values(entries);
  return all.find((entry) => entry.state === "error") ?? all.find((entry) => entry.state === "saving") ?? { state: "saved" };
}
