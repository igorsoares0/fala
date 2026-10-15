"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { activeBlockIndex, blockWords, formatTimecode, isNoSpaceLanguage, type CaptionTrack } from "@fala/shared";

/**
 * Read-only captions next to the video (Phase 3). The active block and word always
 * derive from the <video> clock — never from a separate timer (spec §9.3) — so pause,
 * seek and playback speed stay in sync. Editing arrives with the Phase 4 editor.
 */
export function CaptionsView({
  projectId,
  track,
  width,
  height,
  posterSrc,
}: {
  projectId: string;
  track: CaptionTrack;
  width: number | null;
  height: number | null;
  posterSrc: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const active = activeBlockIndex(track.blocks, timeMs);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  const readClock = useCallback(() => {
    const video = videoRef.current;
    if (video) setTimeMs(Math.round(video.currentTime * 1000));
  }, []);

  // While playing, follow the clock every frame; paused, seeking and loading update it via events.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const tick = () => {
      readClock();
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onStop = () => {
      cancelAnimationFrame(frame);
      readClock();
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStop);
    video.addEventListener("ended", onStop);
    video.addEventListener("seeked", readClock);
    video.addEventListener("timeupdate", readClock);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("ended", onStop);
      video.removeEventListener("seeked", readClock);
      video.removeEventListener("timeupdate", readClock);
    };
  }, [readClock]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function seekTo(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    setTimeMs(ms);
  }

  const joiner = isNoSpaceLanguage(track.language) ? "" : " ";
  const aspect = width && height ? width / height : 9 / 16;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section className="flex min-h-0 min-w-[270px] flex-1 flex-col border-line md:border-r" aria-label="Captions">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-base font-bold tracking-[-0.01em]">Captions</h2>
            <span className="font-mono text-[11.5px] text-muted">{track.blocks.length} blocks</span>
          </div>
          {track.language && (
            <span className="font-mono text-[11.5px] text-muted uppercase" title="Detected language">
              {track.language}
            </span>
          )}
        </div>
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6">
          {track.blocks.map((block, index) => {
            const isActive = index === active;
            const words = blockWords(track, block);
            // Karaoke inside the active block: the current word is the last one that has started.
            const spokenUpTo = isActive ? words.findLastIndex((word) => word.startMs <= timeMs) : -1;
            return (
              <li key={block.id}>
                <button
                  type="button"
                  ref={isActive ? activeRowRef : undefined}
                  onClick={() => seekTo(block.startMs)}
                  aria-current={isActive ? "true" : undefined}
                  data-testid="caption-block"
                  className={`flex w-full flex-col gap-1.5 rounded-[10px] px-3.5 pt-3 pb-3.5 text-left transition-colors hover:bg-panel-1 ${
                    isActive ? "bg-panel-1" : ""
                  }`}
                >
                  <span className={`font-mono text-[11.5px] tabular-nums ${isActive ? "text-accent" : "text-muted"}`}>
                    {formatTimecode(block.startMs)} → {formatTimecode(block.endMs)}
                  </span>
                  <span dir="auto" className="text-[17px] leading-[1.45] tracking-[-0.005em]">
                    {isActive ? (
                      words.map((word, wordIndex) => (
                        <Fragment key={wordIndex}>
                          {wordIndex > 0 && joiner}
                          <span
                            className={
                              wordIndex === spokenUpTo
                                ? "-mx-[3px] rounded-[4px] bg-text px-[3px] text-ink"
                                : wordIndex < spokenUpTo
                                  ? "text-text"
                                  : "text-muted"
                            }
                          >
                            {word.text}
                          </span>
                        </Fragment>
                      ))
                    ) : (
                      <span className="text-[#cfc8bb]">{words.map((word) => word.text).join(joiner)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="flex min-h-0 min-w-[320px] flex-[1.15] items-center justify-center bg-[radial-gradient(70%_60%_at_50%_45%,#1d1b18,#12110f)] p-6"
        aria-label="Preview"
      >
        <div className="flex w-full max-w-[440px] flex-col gap-2">
          <span className="truncate font-mono text-[11px] text-muted">
            YOUR VIDEO · {width}×{height}
          </span>
          <video
            ref={videoRef}
            src={`/api/projects/${projectId}/source`}
            poster={posterSrc}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-[14px] bg-black shadow-thumb"
            style={{ aspectRatio: aspect, maxHeight: "calc(100vh - 160px)" }}
            data-testid="project-video"
          />
        </div>
      </section>
    </div>
  );
}
