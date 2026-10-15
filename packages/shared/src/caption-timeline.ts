import { activeWordIndex, type CaptionTrack } from "./captions";
import { activeWordTransform, POP_TRANSITION_MS, popEasing } from "./caption-render";
import type { CaptionStyle } from "./style";

/**
 * The caption overlay over time, for the export renderer: every distinct picture
 * the preview would show, and when it starts. Uses the same active block/word rules
 * as the preview, and reproduces its "pop" transition frame by frame.
 */

export type OverlayState = {
  blockIndex: number;
  /** Spoken word within the block, -1 before its first word. */
  activeIndex: number;
  /** While popping: the word that was spoken before and the eased progress (0 → 1, overshoots). */
  transition?: { previousIndex: number; eased: number };
};

/** `state: null` is an empty overlay (a gap between blocks). */
export type OverlayFrame = { startMs: number; state: OverlayState | null };

/** Frames per second for the in-between pictures of a pop transition. */
export const OVERLAY_TRANSITION_FPS = 30;

export function overlayStateKey(state: OverlayState | null): string {
  if (!state) return "empty";
  const transition = state.transition ? `:${state.transition.previousIndex}:${state.transition.eased.toFixed(4)}` : "";
  return `${state.blockIndex}:${state.activeIndex}${transition}`;
}

type Change = { atMs: number; state: OverlayState | null; previousIndex?: number };

export function captionFrames(
  track: Pick<CaptionTrack, "words" | "blocks">,
  style: CaptionStyle,
  { durationMs, fps = OVERLAY_TRANSITION_FPS }: { durationMs: number; fps?: number },
): OverlayFrame[] {
  // 1. Every moment the picture changes: a block appears or ends, or the spoken word moves on.
  const changes: Change[] = [];
  for (const [blockIndex, block] of track.blocks.entries()) {
    let active = activeWordIndex(track.words, block, block.startMs);
    // A new block appears at once (the preview remounts it): no transition.
    changes.push({ atMs: block.startMs, state: { blockIndex, activeIndex: active } });
    for (let index = block.wordStart; index <= block.wordEnd; index++) {
      const { startMs } = track.words[index];
      if (startMs <= block.startMs || startMs >= block.endMs) continue;
      const next = activeWordIndex(track.words, block, startMs);
      if (next === active) continue;
      changes.push({ atMs: startMs, state: { blockIndex, activeIndex: next }, previousIndex: active });
      active = next;
    }
    changes.push({ atMs: block.endMs, state: null });
  }

  // 2. Expand pops into in-between frames, each cut short by the next change.
  const animates = activeWordTransform(style) !== null;
  const stepMs = 1000 / fps;
  const frames: OverlayFrame[] = [{ startMs: 0, state: null }];
  for (const [index, change] of changes.entries()) {
    const nextAt = Math.min(changes[index + 1]?.atMs ?? Infinity, durationMs);
    if (change.atMs >= nextAt) continue;
    if (!animates || !change.state || change.previousIndex === undefined) {
      frames.push({ startMs: change.atMs, state: change.state });
      continue;
    }
    for (let elapsed = 0; elapsed < POP_TRANSITION_MS && change.atMs + elapsed < nextAt; elapsed += stepMs) {
      frames.push({
        startMs: change.atMs + elapsed,
        state: { ...change.state, transition: { previousIndex: change.previousIndex, eased: popEasing(elapsed / POP_TRANSITION_MS) } },
      });
    }
    if (change.atMs + POP_TRANSITION_MS < nextAt) frames.push({ startMs: change.atMs + POP_TRANSITION_MS, state: change.state });
  }

  // 3. Same start: the later frame wins. Same picture twice in a row: keep the first.
  const result: OverlayFrame[] = [];
  for (const frame of frames) {
    if (frame.startMs >= durationMs) break;
    const last = result.at(-1);
    if (last && last.startMs === frame.startMs) result.pop();
    if (result.length > 0 && overlayStateKey(result.at(-1)!.state) === overlayStateKey(frame.state)) continue;
    result.push(frame);
  }
  return result;
}
