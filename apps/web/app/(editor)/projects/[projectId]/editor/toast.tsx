"use client";

import { useEffect } from "react";
import { useEditor } from "./editor-store";

const TOAST_MS = 3_200;

/** Editor toast (handoff "Toast"): "Undone: split block" [Redo], "3 words replaced · timing kept" [Undo]. */
export function EditorToast() {
  const toast = useEditor((state) => state.toast);
  const dismiss = useEditor((state) => state.dismissToast);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed top-[68px] left-1/2 z-40 -translate-x-1/2">
      {toast && (
        <div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-text px-4 py-2.5 text-[13.5px] font-semibold text-ink shadow-[0_12px_40px_-12px_rgba(0,0,0,.8)]">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => (toast.action === "undo" ? undo() : redo())}
              className="rounded-md px-1.5 py-0.5 underline underline-offset-[3px] hover:bg-[rgba(18,17,15,.08)]"
            >
              {toast.action === "undo" ? "Undo" : "Redo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
