import { describe, expect, it } from "vitest";
import { emptyHistory, HISTORY_LIMIT, recordChange, redoChange, undoChange } from "./editor-history";

describe("editor history", () => {
  it("undoes and redoes back to the same states", () => {
    let history = recordChange(emptyHistory<string>(), "split block", "A", 0);
    history = recordChange(history, "text edit", "B", 1000);
    // Current document: "C".

    const undone = undoChange(history, "C")!;
    expect(undone).toMatchObject({ state: "B", label: "text edit" });
    const undoneTwice = undoChange(undone.history, undone.state)!;
    expect(undoneTwice).toMatchObject({ state: "A", label: "split block" });
    expect(undoChange(undoneTwice.history, "A")).toBeNull();

    const redone = redoChange(undoneTwice.history, undoneTwice.state)!;
    expect(redone).toMatchObject({ state: "B", label: "split block" });
    expect(redoChange(redone.history, redone.state)).toMatchObject({ state: "C", label: "text edit" });
  });

  it("collapses repeated changes to the same control within 700 ms", () => {
    let history = recordChange(emptyHistory<number>(), "style change", 38, 0, "size");
    history = recordChange(history, "style change", 39, 300, "size");
    history = recordChange(history, "style change", 40, 900, "size");
    expect(history.undo.map((entry) => entry.state)).toEqual([38]);

    history = recordChange(history, "style change", 41, 1700, "size");
    history = recordChange(history, "timing change", 0, 1800, "nudge:b1:start");
    expect(history.undo.map((entry) => entry.state)).toEqual([38, 41, 0]);
  });

  it("forgets redo after a new change and keeps at most 60 steps", () => {
    let history = recordChange(emptyHistory<number>(), "a", 1, 0);
    history = undoChange(history, 2)!.history;
    expect(history.redo).toHaveLength(1);
    history = recordChange(history, "b", 1, 5000);
    expect(history.redo).toHaveLength(0);

    for (let i = 0; i < 100; i++) history = recordChange(history, "x", i, 10_000 + i * 1000);
    expect(history.undo).toHaveLength(HISTORY_LIMIT);
    expect(history.undo[0].state).toBe(40);
  });
});
