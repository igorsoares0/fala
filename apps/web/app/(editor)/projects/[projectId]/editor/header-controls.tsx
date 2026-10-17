"use client";

import { Redo2, Undo2 } from "lucide-react";
import { isActiveExport } from "@fala/shared";
import { useEditor } from "./editor-store";
import { useExports } from "./use-exports";

/** Undo/redo, titled with the step they'd take (handoff §3 header). */
export function UndoRedo() {
  const nextUndo = useEditor((state) => state.history.undo.at(-1)?.label);
  const nextRedo = useEditor((state) => state.history.redo.at(-1)?.label);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const button = "grid size-8 place-items-center rounded-lg text-text transition-colors hover:bg-panel-1 disabled:opacity-25 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-0.5">
      <button type="button" onClick={undo} disabled={!nextUndo} aria-label={nextUndo ? `Undo ${nextUndo}` : "Undo"} title={nextUndo ? `Undo ${nextUndo}` : "Nothing to undo"} className={button}>
        <Undo2 className="size-4" strokeWidth={1.6} />
      </button>
      <button type="button" onClick={redo} disabled={!nextRedo} aria-label={nextRedo ? `Redo ${nextRedo}` : "Redo"} title={nextRedo ? `Redo ${nextRedo}` : "Nothing to redo"} className={button}>
        <Redo2 className="size-4" strokeWidth={1.6} />
      </button>
    </div>
  );
}

/** Right side of the editor header: shortcut hints (wide screens), the Style drawer button (medium screens) and Export. */
export function EditorHeaderControls() {
  const setDrawerOpen = useEditor((state) => state.setDrawerOpen);
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
      <ExportButton />
    </div>
  );
}

/** Opens the export dialog; mirrors the newest render ("Rendering N%", "Render failed"), as in the handoff header. */
function ExportButton() {
  const { latest, blocked, setDialogOpen } = useExports();
  if (blocked) {
    return (
      <span title={blocked}>
        <button type="button" disabled className="rounded-[9px] bg-[rgba(236,230,218,.12)] px-4 py-1.5 text-[13.5px] font-semibold text-muted">
          Export
        </button>
      </span>
    );
  }
  const failed = latest?.status === "FAILED";
  const rendering = latest !== null && isActiveExport(latest.status);
  return (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      aria-haspopup="dialog"
      className={`rounded-[9px] px-4 py-1.5 text-[13.5px] font-semibold whitespace-nowrap tabular-nums transition-colors ${
        failed ? "bg-danger text-ink hover:brightness-110" : "bg-text text-ink hover:bg-white"
      }`}
    >
      {rendering ? `Rendering ${latest.progress}%` : failed ? "Render failed" : "Export"}
    </button>
  );
}

/** The Export button before the project has captions: visible but unavailable (handoff header). */
export function ExportButtonUnavailable() {
  return (
    <span className="ml-auto" title="Available once transcription finishes">
      <button
        type="button"
        disabled
        className="rounded-[9px] bg-[rgba(236,230,218,.12)] px-4 py-1.5 text-[13.5px] font-semibold text-muted"
      >
        Export
      </button>
    </span>
  );
}
