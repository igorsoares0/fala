/**
 * Undo/redo history for the editor (handoff "Undo/redo"): snapshots of the document
 * before each change, at most 60. Repeated changes to the same control within 700 ms
 * (a slider drag, nudges in a row) collapse into one step. Pure, so it's unit-tested.
 */

export const HISTORY_LIMIT = 60;
export const COALESCE_MS = 700;

export type HistoryEntry<S> = { label: string; state: S };

export type History<S> = {
  undo: HistoryEntry<S>[];
  redo: HistoryEntry<S>[];
  lastKey: string | null;
  lastAt: number;
};

export function emptyHistory<S>(): History<S> {
  return { undo: [], redo: [], lastKey: null, lastAt: 0 };
}

/** Records `before` (the state prior to a change) under `label`. A new change clears the redo stack. */
export function recordChange<S>(history: History<S>, label: string, before: S, now: number, coalesceKey?: string): History<S> {
  if (coalesceKey && coalesceKey === history.lastKey && now - history.lastAt < COALESCE_MS) {
    return { ...history, lastAt: now };
  }
  return {
    undo: [...history.undo, { label, state: before }].slice(-HISTORY_LIMIT),
    redo: [],
    lastKey: coalesceKey ?? null,
    lastAt: now,
  };
}

type Step<S> = { history: History<S>; state: S; label: string } | null;

/** Goes back one step; `current` becomes redoable. */
export function undoChange<S>(history: History<S>, current: S): Step<S> {
  const entry = history.undo.at(-1);
  if (!entry) return null;
  return {
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, { label: entry.label, state: current }], lastKey: null, lastAt: 0 },
    state: entry.state,
    label: entry.label,
  };
}

/** Re-applies the last undone step; `current` becomes undoable again. */
export function redoChange<S>(history: History<S>, current: S): Step<S> {
  const entry = history.redo.at(-1);
  if (!entry) return null;
  return {
    history: { undo: [...history.undo, { label: entry.label, state: current }], redo: history.redo.slice(0, -1), lastKey: null, lastAt: 0 },
    state: entry.state,
    label: entry.label,
  };
}
