"use client";

import { useEditorUi } from "./editor-ui";

/** Right side of the editor header once captions exist: shortcut hints (wide screens) and the Style drawer button (medium screens). */
export function EditorHeaderControls() {
  const setDrawerOpen = useEditorUi((ui) => ui.setDrawerOpen);
  const kbd = "rounded-[5px] border border-line-strong px-1.5 py-px font-mono text-[11px] text-text";
  return (
    <div className="ml-auto flex items-center gap-4">
      <span className="hidden items-center gap-3 text-[12px] text-muted min-[1100px]:flex">
        <span className="flex items-center gap-1.5">
          <kbd className={kbd}>space</kbd> play
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className={kbd}>← →</kbd> blocks
        </span>
      </span>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="hidden rounded-[9px] border border-line-button px-3.5 py-1.5 text-[13.5px] font-semibold text-text hover:bg-panel-1 min-[720px]:max-[1099px]:inline-flex"
      >
        Style
      </button>
    </div>
  );
}
