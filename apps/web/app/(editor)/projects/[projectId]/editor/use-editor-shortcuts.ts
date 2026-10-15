import { useEffect } from "react";
import { useEditorStore } from "./editor-store";

/** Space plays/pauses, ←/→ jump between blocks. Never while the user is typing or using a control that needs the keys. */
export function useEditorShortcuts() {
  const store = useEditorStore();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='slider']")) return;

      const { togglePlay, prevBlock, nextBlock } = store.getState();
      if (event.key === " ") {
        // Space on a focused button would also "click" it.
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevBlock();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nextBlock();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
