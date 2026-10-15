"use client";

import { useEffect } from "react";
import { combineSaveStatus, useSaveStatus, type SaveState } from "@/lib/save-status";

const INDICATOR: Record<SaveState, { dot: string; label: string; short: string; action?: string }> = {
  saved: { dot: "bg-success", label: "Saved", short: "Saved" },
  saving: { dot: "bg-warning", label: "Saving…", short: "Saving…" },
  offline: { dot: "bg-danger", label: "Offline · kept in this browser", short: "Offline", action: "Retry now" },
  error: { dot: "bg-danger", label: "Not saved", short: "Not saved", action: "Retry now" },
  conflict: { dot: "bg-danger", label: "Changed in another tab", short: "Changed elsewhere", action: "Reload" },
};

/** Header save indicator (handoff §3): green "Saved", amber "Saving…", red problems with a way out. */
export function SaveIndicator() {
  // Select the stable entries object; combining inside the selector would return a new object each time.
  const status = combineSaveStatus(useSaveStatus((store) => store.entries));
  const reset = useSaveStatus((store) => store.reset);
  // A fresh editor starts clean; statuses from a previous project don't carry over.
  useEffect(() => reset, [reset]);
  const { dot, label, short, action } = INDICATOR[status.state];

  return (
    <span className="flex items-center gap-2 font-mono text-[11.5px] text-muted" role="status" title={status.error}>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="max-sm:sr-only min-[900px]:hidden">{short}</span>
      <span className="hidden min-[900px]:inline">{label}</span>
      {action && status.retry && (
        <button
          type="button"
          onClick={status.retry}
          className="rounded-md border border-line-button px-2 py-0.5 font-sans text-[12px] font-semibold whitespace-nowrap text-text hover:bg-panel-1"
        >
          {action}
        </button>
      )}
    </span>
  );
}
