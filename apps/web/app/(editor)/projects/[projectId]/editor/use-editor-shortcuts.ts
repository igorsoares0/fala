import { useEffect } from "react";
import { useEditorStore } from "./editor-store";

/**
 * Editor keyboard (handoff "Keyboard"): Space play/pause · ←/→ previous/next block ·
 * Esc close find / cancel edit / deselect · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y
 * redo · Ctrl/Cmd+F find & replace. Ignored while typing (fields keep their own undo),
 * except Ctrl/Cmd+F, which always opens find instead of the browser's.
 */
export function useEditorShortcuts() {
  const store = useEditorStore();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey) return;
      // A modal (export, unsynced changes) owns the keyboard while it's open.
      if (document.querySelector("[aria-modal='true']")) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const editor = store.getState();
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (command && key === "f") {
        event.preventDefault();
        editor.setFindOpen(true);
        return;
      }
      if (typing) return;

      if (command) {
        if (key === "z" && !event.shiftKey) editor.undo();
        else if ((key === "z" && event.shiftKey) || key === "y") editor.redo();
        else return;
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        if (editor.findOpen) editor.setFindOpen(false);
        else if (editor.editingId) editor.startEditing(null);
        else if (editor.selectedId) editor.select(null);
        else return;
        event.preventDefault();
        return;
      }

      // The playback slider uses the arrows itself.
      if (target?.closest("[role='slider']")) return;
      if (event.key === " ") {
        // Space on a focused button would also "click" it.
        event.preventDefault();
        editor.togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        editor.prevBlock();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        editor.nextBlock();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
