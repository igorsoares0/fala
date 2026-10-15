"use client";

import { useEffect } from "react";
import { combineSaveStatus, useSaveStatus, type SaveState } from "@/lib/save-status";

const INDICATOR: Record<SaveState, { dot: string; label: string }> = {
  saved: { dot: "bg-success", label: "Saved" },
  saving: { dot: "bg-warning", label: "Saving…" },
  error: { dot: "bg-danger", label: "Not saved" },
};

/** Header save indicator: green "Saved", amber "Saving…", red "Not saved" + "Retry now". */
export function SaveIndicator() {
  // Select the stable entries object; combining inside the selector would return a new object each time.
  const status = combineSaveStatus(useSaveStatus((store) => store.entries));
  const reset = useSaveStatus((store) => store.reset);
  // A fresh editor starts clean; statuses from a previous project don't carry over.
  useEffect(() => reset, [reset]);
  const { dot, label } = INDICATOR[status.state];

  return (
    <span className="flex items-center gap-2 font-mono text-[11.5px] text-muted" role="status" title={status.error}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
      {status.state === "error" && status.retry && (
        <button
          type="button"
          onClick={status.retry}
          className="rounded-md border border-line-button px-2 py-0.5 font-sans text-[12px] font-semibold text-text hover:bg-panel-1"
        >
          Retry now
        </button>
      )}
    </span>
  );
}
