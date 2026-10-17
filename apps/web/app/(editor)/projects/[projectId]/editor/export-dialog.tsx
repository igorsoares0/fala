"use client";

import { useEffect, useState } from "react";
import {
  EXPORT_RESOLUTIONS,
  exportDimensions,
  formatBytes,
  formatTimecode,
  isActiveExport,
  isPresetModified,
  PRESETS,
  type ExportResolution,
} from "@fala/shared";
import { accentButton, outlineButton, smallCreamButton } from "@/components/ui";
import { formatExportDate } from "@/lib/dates";
import type { ExportView } from "@/lib/exports";
import { useEditor } from "./editor-store";
import { useExports } from "./use-exports";

const RESOLUTION_COPY: Record<ExportResolution, string> = {
  720: "Faster · smaller",
  1080: "Original quality",
};

type Stage = "config" | "latest";

/**
 * Export modal (handoff §4): choose a resolution and render; then the render's
 * progress, its failure or the finished file; and always the earlier versions,
 * which a new render never overwrites.
 */
export function ExportDialog({ width, height }: { width: number | null; height: number | null }) {
  const { dialogOpen } = useExports();
  // Mounted on each opening, so it starts from the newest export's state.
  return dialogOpen ? <OpenExportDialog width={width} height={height} /> : null;
}

function OpenExportDialog({ width, height }: { width: number | null; height: number | null }) {
  const { latest, setDialogOpen } = useExports();
  // "latest" shows the newest export's state; "config" is the form for a new one.
  const [stage, setStage] = useState<Stage>(latest ? "latest" : "config");

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The editor's own Escape (deselect, close find) must not also fire.
      event.preventDefault();
      event.stopImmediatePropagation();
      setDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      opener?.focus?.();
    };
  }, [setDialogOpen]);

  const close = () => setDialogOpen(false);
  const showLatest = stage === "latest" && latest !== null;

  return (
    <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-[rgba(8,7,6,.62)] p-4 backdrop-blur-[6px]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[min(460px,100%)] flex-col gap-5 rounded-[18px] border border-line bg-panel-1 p-[26px]"
      >
        {!showLatest ? (
          <ConfigStage width={width} height={height} onCancel={close} onStarted={() => setStage("latest")} />
        ) : isActiveExport(latest.status) ? (
          <RenderingStage item={latest} onClose={close} />
        ) : latest.status === "FAILED" ? (
          <FailedStage item={latest} onClose={close} />
        ) : (
          <DoneStage item={latest} onNewVersion={() => setStage("config")} />
        )}
        <PreviousVersions exclude={showLatest && latest.status === "SUCCEEDED" ? latest.id : null} />
      </div>
    </div>
  );
}

function ConfigStage({
  width,
  height,
  onCancel,
  onStarted,
}: {
  width: number | null;
  height: number | null;
  onCancel: () => void;
  onStarted: () => void;
}) {
  const { start, maxResolution } = useExports();
  const presetKey = useEditor((state) => state.presetKey);
  const styleConfig = useEditor((state) => state.styleConfig);
  const blocks = useEditor((state) => state.track.blocks.length);
  const durationMs = useEditor((state) => state.durationMs);
  const options = resolutionOptions(width, height, maxResolution);
  const [resolution, setResolution] = useState<ExportResolution>(options.findLast((option) => option.disabled === null)?.value ?? 720);
  const [busy, setBusy] = useState<"saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function render() {
    setBusy("saving");
    setError(null);
    const result = await start(resolution);
    setBusy(null);
    if (result.ok) onStarted();
    else setError(result.error);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 id="export-title" className="text-[26px] font-bold tracking-[-0.03em]">
          Export video
        </h2>
        <p className="text-[14px] text-muted">MP4 with captions burned into the image.</p>
      </div>

      <div role="radiogroup" aria-label="Resolution" className="grid grid-cols-2 gap-2.5">
        {options.map((option) => {
          const selected = option.value === resolution;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled !== null}
              onClick={() => setResolution(option.value)}
              className={`flex flex-col items-start gap-1 rounded-[12px] px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? "border-[1.5px] border-text bg-panel-2" : "border-[1.5px] border-line-strong hover:bg-panel-2"
              }`}
            >
              <span className="text-[19px] font-bold tracking-[-0.02em]">{option.value}p</span>
              <span className="text-[12.5px] text-muted">
                {option.disabled === "plan" ? "Creator and Pro" : option.disabled === "smaller" ? "Your video is smaller" : option.copy}
              </span>
              {option.size && <span className="font-mono text-[10.5px] text-muted tabular-nums">{option.size}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-[12px] bg-ink px-4 py-3.5 font-mono text-[12px] leading-relaxed">
        <span className="text-text">
          {PRESETS[presetKey].name}
          {isPresetModified(presetKey, styleConfig) ? " (edited)" : ""} · {blocks} {blocks === 1 ? "block" : "blocks"} · {formatTimecode(durationMs)}
        </span>
        <span className="text-muted">We freeze this version. You can keep editing while it renders.</span>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={outlineButton}>
          Cancel
        </button>
        <button type="button" onClick={render} disabled={busy !== null} className={accentButton}>
          {busy === "saving" ? "Saving your changes…" : "Render"}
        </button>
      </div>
    </>
  );
}

/**
 * 720p and 1080p, each with the size it would really produce. Disabled when the plan
 * doesn't include it, or when it adds nothing over the smaller one (a small video).
 */
function resolutionOptions(width: number | null, height: number | null, maxResolution: ExportResolution) {
  let previous = "";
  return EXPORT_RESOLUTIONS.map((value) => {
    const size = width && height ? exportDimensions(width, height, value) : null;
    const label = size ? `${size.width}×${size.height}` : "";
    const disabled: "plan" | "smaller" | null = value > maxResolution ? "plan" : label !== "" && label === previous ? "smaller" : null;
    previous = label;
    return { value, copy: RESOLUTION_COPY[value], size: label, disabled };
  });
}

function RenderingStage({ item, onClose }: { item: ExportView; onClose: () => void }) {
  return (
    <>
      <span id="export-title" className="font-mono text-[11.5px] tracking-[0.08em] text-muted">
        {item.status === "QUEUED" ? "STARTING" : "RENDERING"} · {item.resolution}p
      </span>
      <div className="flex flex-col gap-3" role="status" aria-label={`Rendering, ${item.progress}%`}>
        <span className="text-[72px] leading-none font-bold tracking-[-0.05em] tabular-nums">{item.progress}%</span>
        <div className="h-1 overflow-hidden rounded-full bg-[rgba(236,230,218,.12)]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${item.progress}%` }} />
        </div>
      </div>
      <p className="text-[14px] text-pretty text-muted">You can close this window or the tab — it keeps rendering, and the file will be here when it&apos;s done.</p>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={smallCreamButton} autoFocus>
          Keep editing
        </button>
      </div>
    </>
  );
}

function FailedStage({ item, onClose }: { item: ExportView; onClose: () => void }) {
  const { retry } = useExports();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <span aria-hidden className="text-[22px] text-danger">
        ▲
      </span>
      <div className="flex flex-col gap-2">
        <h2 id="export-title" className="text-[24px] font-bold tracking-[-0.03em]">
          The render stopped at {item.progress}%
        </h2>
        <p className="text-[14px] text-pretty text-muted">{item.error?.message}</p>
        <span className="font-mono text-[11.5px] text-muted">
          {item.error?.code} · ref {item.error?.ref}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={outlineButton}>
          Close
        </button>
        <button
          type="button"
          disabled={busy}
          autoFocus
          onClick={async () => {
            setBusy(true);
            const result = await retry(item.id);
            setBusy(false);
            setError(result.ok ? null : result.error);
          }}
          className={accentButton}
        >
          Try again
        </button>
      </div>
    </>
  );
}

function DoneStage({ item, onNewVersion }: { item: ExportView; onNewVersion: () => void }) {
  return (
    <>
      <h2 id="export-title" className="text-[40px] leading-none font-bold tracking-[-0.04em]">
        Done<span className="text-accent">.</span>
      </h2>
      <span className="font-mono text-[12px] break-all text-muted">{fileLine(item)}</span>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onNewVersion} className={outlineButton}>
          New version
        </button>
        <a href={downloadHref(item)} download={item.fileName} className={smallCreamButton} autoFocus>
          Download MP4
        </a>
      </div>
    </>
  );
}

function PreviousVersions({ exclude }: { exclude: string | null }) {
  const { exports } = useExports();
  const done = exports.filter((item) => item.status === "SUCCEEDED" && item.id !== exclude);
  if (done.length === 0) return null;
  return (
    <section aria-label="Previous versions" className="flex flex-col gap-2.5 border-t border-line pt-4">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted">PREVIOUS VERSIONS</span>
      <ul className="flex flex-col gap-2">
        {done.map((item) => (
          <li key={item.id} className="flex items-center gap-4 text-[13.5px]" data-testid="export-version">
            <span className="w-7 font-mono font-semibold">v{item.version}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {item.height && item.width ? `${Math.min(item.width, item.height)}p` : `${item.resolution}p`}
              {item.fileSizeBytes ? ` · ${formatBytes(item.fileSizeBytes)}` : ""}
              {item.completedAt ? ` · ${formatExportDate(new Date(item.completedAt))}` : ""}
            </span>
            <a href={downloadHref(item)} download={item.fileName} className="font-semibold underline underline-offset-4 hover:text-white" aria-label={`Download v${item.version}`}>
              Download
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const downloadHref = (item: ExportView) => `/api/exports/${item.id}/download`;

function fileLine(item: ExportView) {
  const parts = [item.fileName];
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  if (item.fileSizeBytes) parts.push(formatBytes(item.fileSizeBytes));
  return parts.join(" · ");
}
