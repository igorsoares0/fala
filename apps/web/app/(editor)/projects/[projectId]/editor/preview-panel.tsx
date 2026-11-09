"use client";

import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { activeBlockIndex, activeWordIndex, blockWords, formatTimecode } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";
import { useEditor } from "./editor-store";
import { TrimHandles, TrimSummary, TrimToggle } from "./trim-controls";
import { useVideoClock } from "./use-video-clock";

/** Video with the caption overlay, the playback bar and the transport controls (handoff §3, preview column). */
export function PreviewPanel({
  width,
  height,
  posterSrc,
  className = "",
}: {
  width: number | null;
  height: number | null;
  posterSrc: string;
  className?: string;
}) {
  const projectId = useEditor((state) => state.projectId);
  const togglePlay = useEditor((state) => state.togglePlay);
  const playing = useEditor((state) => state.playing);
  const atStart = useEditor((state) => state.timeMs <= state.trim.startMs);
  const trimMode = useEditor((state) => state.trimMode);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useVideoClock(video);

  const aspect = width && height ? width / height : 9 / 16;
  // Trimming adds a row under the bar: the frame gives up that much height.
  const frame = frameWidth(aspect, trimMode ? 250 : 210);

  return (
    <section
      className={`flex min-h-0 min-w-0 items-center justify-center bg-[radial-gradient(70%_60%_at_50%_45%,#1d1b18,#12110f)] p-4 min-[720px]:p-6 ${className}`}
      aria-label="Preview"
    >
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-3 font-mono text-[11px] text-muted" style={{ maxWidth: frame }}>
          <span className="truncate">
            YOUR VIDEO · {width}×{height}
          </span>
          <TrimToggle />
        </div>
        <div
          className="relative overflow-hidden rounded-[14px] bg-black shadow-thumb [container-type:inline-size]"
          style={{ aspectRatio: aspect, width: frame }}
          onClick={togglePlay}
          data-testid="preview-frame"
        >
          <video
            ref={setVideo}
            src={`/api/projects/${projectId}/source`}
            poster={posterSrc}
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover"
            data-testid="project-video"
          />
          <CaptionOverlay />
          {!playing && atStart && (
            <span
              aria-hidden
              className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(18,17,15,.6)] text-text backdrop-blur-sm"
            >
              <Play className="size-7 translate-x-0.5" fill="currentColor" />
            </span>
          )}
        </div>
        <div className="flex w-full flex-col gap-3">
          <PlaybackBar />
          {trimMode && <TrimSummary />}
          <Controls />
        </div>
      </div>
    </section>
  );
}

/** The frame fills the column but never makes the editor scroll: `reservedPx` leaves room for the label and controls. */
function frameWidth(aspect: number, reservedPx: number) {
  return `min(100%, calc((var(--preview-height, 100vh) - ${reservedPx}px) * ${aspect}))`;
}

/**
 * The stretch of source time the playback bar spans: the part the export keeps — so the
 * bar reads like the finished video — or the whole video while trimming.
 */
function usePlaybackWindow() {
  const durationMs = useEditor((state) => state.durationMs);
  const trim = useEditor((state) => state.trim);
  const trimMode = useEditor((state) => state.trimMode);
  return trimMode ? { fromMs: 0, toMs: durationMs } : { fromMs: trim.startMs, toMs: trim.endMs };
}

/** The active block's words over the video, styled by the shared caption contract. */
function CaptionOverlay() {
  const track = useEditor((state) => state.track);
  const timeMs = useEditor((state) => state.timeMs);
  const style = useEditor((state) => state.styleConfig);
  const active = activeBlockIndex(track.blocks, timeMs);
  if (active < 0) return null;
  const block = track.blocks[active];

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="caption-overlay">
      <CaptionSample
        key={block.id}
        style={style}
        words={blockWords(track, block).map((word) => word.text)}
        activeIndex={activeWordIndex(track.words, block, timeMs)}
      />
    </div>
  );
}

/** Not an edit timeline: a seek bar with a tick at every block start, and the trim handles while trimming. */
function PlaybackBar() {
  const { fromMs, toMs } = usePlaybackWindow();
  const trim = useEditor((state) => state.trim);
  const trimMode = useEditor((state) => state.trimMode);
  const timeMs = useEditor((state) => state.timeMs);
  const seek = useEditor((state) => state.seek);
  const trackRef = useRef<HTMLDivElement>(null);
  const spanMs = toMs - fromMs;
  const elapsedMs = Math.min(spanMs, Math.max(0, timeMs - fromMs));
  const progress = elapsedMs / spanMs;
  // While trimming the bar spans the whole video, and the kept part sits somewhere inside it.
  const keptFrom = (trim.startMs - fromMs) / spanMs;
  const keptTo = (trim.endMs - fromMs) / spanMs;

  function seekToPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    seek(fromMs + ((event.clientX - rect.left) / rect.width) * spanMs);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5000 : 1000;
    if (event.key === "ArrowLeft") seek(timeMs - step);
    else if (event.key === "ArrowRight") seek(timeMs + step);
    else if (event.key === "Home") seek(fromMs);
    else if (event.key === "End") seek(toMs);
    else return;
    event.preventDefault();
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={spanMs}
        aria-valuenow={elapsedMs}
        aria-valuetext={`${formatTimecode(elapsedMs)} of ${formatTimecode(spanMs)}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekToPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekToPointer(event);
        }}
        onKeyDown={onKeyDown}
        className="group relative flex h-4 cursor-pointer touch-none items-center rounded"
      >
        <div className="relative h-1 w-full rounded-full bg-[rgba(236,230,218,.15)]">
          {trimMode && (
            <div
              data-testid="trim-kept"
              className="absolute inset-y-0 rounded-full bg-[rgba(236,230,218,.3)]"
              style={{ left: `${keptFrom * 100}%`, right: `${(1 - keptTo) * 100}%` }}
            />
          )}
          {/* Fill and playhead move with transforms, which need no layout: in a long video's
              editor, a layout on every frame would cost more than the frame itself. */}
          <div
            className="absolute inset-0 origin-left rounded-full bg-text"
            style={{ transform: `translateX(${keptFrom * 100}%) scaleX(${Math.max(0, progress - keptFrom)})` }}
          />
          <BlockTicks fromMs={fromMs} toMs={toMs} />
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2" style={{ transform: `translateX(${progress * 100}%)` }}>
          <span className="absolute top-0 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--color-ink)]" />
        </span>
      </div>
      {trimMode && <TrimHandles trackRef={trackRef} />}
    </div>
  );
}

/**
 * A tick at every block start, drawn as one SVG path: a long video has thousands of
 * blocks, and as many elements here would weigh on every layout. Re-renders only when
 * the blocks, the active block or the bar's window change.
 */
const BlockTicks = memo(function BlockTicks({ fromMs, toMs }: { fromMs: number; toMs: number }) {
  const blocks = useEditor((state) => state.track.blocks);
  const active = useEditor((state) => activeBlockIndex(state.track.blocks, state.timeMs));
  const ticks = useMemo(() => blocks.map((block) => tickPath(block.startMs, fromMs, toMs)).join(""), [blocks, fromMs, toMs]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 8"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 overflow-visible"
    >
      <path d={ticks} stroke="rgba(236,230,218,.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {active >= 0 && (
        <path d={tickPath(blocks[active].startMs, fromMs, toMs)} stroke="var(--color-accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
});

/** A vertical tick at `ms`, in the 1000-wide viewBox of <BlockTicks>; nothing for a block that starts outside the bar. */
const tickPath = (ms: number, fromMs: number, toMs: number) =>
  ms < fromMs || ms > toMs ? "" : `M${(((ms - fromMs) / (toMs - fromMs)) * 1000).toFixed(2)} 0V8`;

function Controls() {
  const { fromMs, toMs } = usePlaybackWindow();
  const timeMs = useEditor((state) => state.timeMs);
  const playing = useEditor((state) => state.playing);
  const rate = useEditor((state) => state.rate);
  const togglePlay = useEditor((state) => state.togglePlay);
  const prevBlock = useEditor((state) => state.prevBlock);
  const nextBlock = useEditor((state) => state.nextBlock);
  const cycleRate = useEditor((state) => state.cycleRate);
  const round = "grid place-items-center rounded-full transition-colors";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <span className="font-mono text-xs whitespace-nowrap text-muted tabular-nums" data-testid="playback-time">
        <span className="text-text">{formatTimecode(Math.min(toMs, Math.max(fromMs, timeMs)) - fromMs)}</span> / {formatTimecode(toMs - fromMs)}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={prevBlock} aria-label="Previous block" className={`${round} size-[34px] text-text hover:bg-panel-1`}>
          <SkipBack className="size-4" fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className={`${round} size-[46px] bg-text text-ink hover:bg-white`}
        >
          {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-px" fill="currentColor" />}
        </button>
        <button type="button" onClick={nextBlock} aria-label="Next block" className={`${round} size-[34px] text-text hover:bg-panel-1`}>
          <SkipForward className="size-4" fill="currentColor" />
        </button>
      </div>
      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Playback speed ${rate}×`}
        className="justify-self-end rounded-lg border border-line-button px-2.5 py-1 font-mono text-xs text-text hover:bg-panel-1"
      >
        {rate}×
      </button>
    </div>
  );
}
