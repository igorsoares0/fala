"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { activeBlockIndex, activeWordIndex, blockWords, formatTimecode } from "@fala/shared";
import { CaptionSample } from "@/components/caption-sample";
import { useEditor } from "./editor-store";
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
  const atStart = useEditor((state) => state.timeMs === 0);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useVideoClock(video);

  const aspect = width && height ? width / height : 9 / 16;

  return (
    <section
      className={`flex min-h-0 min-w-0 items-center justify-center bg-[radial-gradient(70%_60%_at_50%_45%,#1d1b18,#12110f)] p-4 min-[720px]:p-6 ${className}`}
      aria-label="Preview"
    >
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3">
        <span className="w-full truncate font-mono text-[11px] text-muted" style={{ maxWidth: frameWidth(aspect) }}>
          YOUR VIDEO · {width}×{height}
        </span>
        <div
          className="relative overflow-hidden rounded-[14px] bg-black shadow-thumb [container-type:inline-size]"
          style={{ aspectRatio: aspect, width: frameWidth(aspect) }}
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
          <Controls />
        </div>
      </div>
    </section>
  );
}

/** The frame fills the column but never makes the editor scroll: 210px leaves room for the label and controls. */
function frameWidth(aspect: number) {
  return `min(100%, calc((var(--preview-height, 100vh) - 210px) * ${aspect}))`;
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

/** Not an edit timeline: a seek bar with a tick at every block start. */
function PlaybackBar() {
  const durationMs = useEditor((state) => state.durationMs);
  const timeMs = useEditor((state) => state.timeMs);
  const blocks = useEditor((state) => state.track.blocks);
  const seek = useEditor((state) => state.seek);
  const trackRef = useRef<HTMLDivElement>(null);
  const active = activeBlockIndex(blocks, timeMs);
  const percent = (ms: number) => `${(Math.min(ms, durationMs) / durationMs) * 100}%`;

  function seekToPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    seek(((event.clientX - rect.left) / rect.width) * durationMs);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5000 : 1000;
    if (event.key === "ArrowLeft") seek(timeMs - step);
    else if (event.key === "ArrowRight") seek(timeMs + step);
    else if (event.key === "Home") seek(0);
    else if (event.key === "End") seek(durationMs);
    else return;
    event.preventDefault();
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={timeMs}
      aria-valuetext={`${formatTimecode(timeMs)} of ${formatTimecode(durationMs)}`}
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
        <div className="absolute inset-y-0 left-0 rounded-full bg-text" style={{ width: percent(timeMs) }} />
        {blocks.map((block, index) => (
          <span
            key={block.id}
            aria-hidden
            className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${index === active ? "bg-accent" : "bg-[rgba(236,230,218,.35)]"}`}
            style={{ left: percent(block.startMs) }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--color-ink)]"
        style={{ left: percent(timeMs) }}
      />
    </div>
  );
}

function Controls() {
  const durationMs = useEditor((state) => state.durationMs);
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
        <span className="text-text">{formatTimecode(timeMs)}</span> / {formatTimecode(durationMs)}
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
