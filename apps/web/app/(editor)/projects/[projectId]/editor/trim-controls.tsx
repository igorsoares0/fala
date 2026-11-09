"use client";

import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Scissors } from "lucide-react";
import { formatTimecode, isTrimmed, MIN_TRIM_MS, NUDGE_STEP_MS, trimLengthMs, type TrimEdge } from "@fala/shared";
import { useEditor } from "./editor-store";

/**
 * Trimming the start and end of the video. Still not an edit timeline (handoff §3):
 * the playback bar grows a handle at each end of the part to keep, and the export
 * renders only that part.
 */

/** Opens and closes trimming; stays lit while the project is trimmed. */
export function TrimToggle() {
  const trimMode = useEditor((state) => state.trimMode);
  const trimmed = useEditor((state) => isTrimmed(state.trim, state.durationMs));
  const setTrimMode = useEditor((state) => state.setTrimMode);

  return (
    <button
      type="button"
      onClick={() => setTrimMode(!trimMode)}
      aria-pressed={trimMode}
      title="Cut the start and end of the video"
      // The negative margin gives a taller touch target without making the label row taller.
      className={`-my-2 flex shrink-0 items-center gap-1.5 rounded py-2 font-mono text-[11px] uppercase transition-colors ${
        trimMode || trimmed ? "text-accent" : "text-muted hover:text-text"
      }`}
    >
      <Scissors aria-hidden className="size-3" />
      {trimmed ? "Trimmed" : "Trim"}
    </button>
  );
}

const smallButton =
  "rounded-[7px] border border-line-button px-2.5 py-1 text-[12.5px] font-semibold text-text transition-colors hover:bg-panel-1 disabled:opacity-30";

/** What's kept, in source time, with its length; shown under the bar while trimming. */
export function TrimSummary() {
  const durationMs = useEditor((state) => state.durationMs);
  const trim = useEditor((state) => state.trim);
  const resetTrim = useEditor((state) => state.resetTrim);
  const setTrimMode = useEditor((state) => state.setTrimMode);

  return (
    <div role="group" aria-label="Trim" className="flex h-7 items-center justify-between gap-3">
      <span className="font-mono text-[11.5px] whitespace-nowrap text-muted tabular-nums" data-testid="trim-summary">
        <span className="text-text">
          {formatTimecode(trim.startMs)} → {formatTimecode(trim.endMs)}
        </span>{" "}
        · {formatTimecode(trimLengthMs(trim))}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={resetTrim} disabled={!isTrimmed(trim, durationMs)} className={smallButton}>
          Reset
        </button>
        <button type="button" onClick={() => setTrimMode(false)} className={smallButton}>
          Done
        </button>
      </div>
    </div>
  );
}

/** The two handles over the playback bar, which spans the whole video while trimming. */
export function TrimHandles({ trackRef }: { trackRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <TrimHandle edge="start" trackRef={trackRef} />
      <TrimHandle edge="end" trackRef={trackRef} />
    </>
  );
}

function TrimHandle({ edge, trackRef }: { edge: TrimEdge; trackRef: RefObject<HTMLDivElement | null> }) {
  const durationMs = useEditor((state) => state.durationMs);
  const valueMs = useEditor((state) => (edge === "start" ? state.trim.startMs : state.trim.endMs));
  const otherMs = useEditor((state) => (edge === "start" ? state.trim.endMs : state.trim.startMs));
  const setTrimEdge = useEditor((state) => state.setTrimEdge);
  // Where inside the handle the pointer grabbed it, so it doesn't jump on the first move.
  const grabOffset = useRef(0);

  const minLength = Math.min(MIN_TRIM_MS, durationMs);
  const [lowest, highest] = edge === "start" ? [0, otherMs - minLength] : [otherMs + minLength, durationMs];

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    grabOffset.current = event.clientX - (rect.left + (valueMs / durationMs) * rect.width);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setTrimEdge(edge, ((event.clientX - grabOffset.current - rect.left) / rect.width) * durationMs);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 1000 : NUDGE_STEP_MS;
    if (event.key === "ArrowLeft") setTrimEdge(edge, valueMs - step);
    else if (event.key === "ArrowRight") setTrimEdge(edge, valueMs + step);
    else if (event.key === "Home") setTrimEdge(edge, lowest);
    else if (event.key === "End") setTrimEdge(edge, highest);
    else return;
    event.preventDefault();
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={edge === "start" ? "Trim start" : "Trim end"}
      aria-valuemin={lowest}
      aria-valuemax={highest}
      aria-valuenow={valueMs}
      aria-valuetext={formatTimecode(valueMs)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      // Each handle sits outside the part it bounds — start to the left, end to the right —
      // so the two never cover each other, however short the kept part gets.
      className={`absolute top-1/2 z-10 flex h-8 w-6 -translate-y-1/2 cursor-ew-resize touch-none items-center rounded ${
        edge === "start" ? "-translate-x-full justify-end" : "justify-start"
      }`}
      style={{ left: `${(valueMs / durationMs) * 100}%` }}
    >
      <span aria-hidden className="h-5 w-1.5 rounded-full bg-text shadow-[0_0_0_2px_var(--color-ink)]" />
    </div>
  );
}
