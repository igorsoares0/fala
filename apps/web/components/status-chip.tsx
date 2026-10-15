import type { ProjectStatus } from "@fala/shared";

/** Glyph + label for every status, so state never relies on color alone. */
const STATUS_DISPLAY: Record<ProjectStatus, { glyph: string; label: string; className: string }> = {
  CREATED: { glyph: "○", label: "Waiting for upload", className: "text-muted" },
  UPLOADING: { glyph: "↑", label: "Uploading", className: "text-accent" },
  UPLOADED: { glyph: "◌", label: "Validating", className: "text-accent" },
  PROCESSING: { glyph: "◌", label: "Transcribing", className: "text-accent" },
  READY: { glyph: "●", label: "Ready", className: "text-success" },
  RENDERING: { glyph: "◐", label: "Rendering", className: "text-accent" },
  COMPLETED: { glyph: "✓", label: "Exported", className: "text-text" },
  FAILED: { glyph: "▲", label: "Error", className: "text-danger" },
  DELETION_PENDING: { glyph: "×", label: "Deleting", className: "text-muted" },
  DELETED: { glyph: "×", label: "Deleted", className: "text-muted" },
};

/** `progress` completes the Rendering label ("Rendering 42%"). */
export function StatusChip({ status, progress }: { status: ProjectStatus; progress?: number }) {
  const { glyph, className } = STATUS_DISPLAY[status];
  const label = status === "RENDERING" && progress !== undefined ? `Rendering ${progress}%` : STATUS_DISPLAY[status].label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] ${className}`}
    >
      <span aria-hidden>{glyph}</span>
      <span className="text-text">{label}</span>
    </span>
  );
}
