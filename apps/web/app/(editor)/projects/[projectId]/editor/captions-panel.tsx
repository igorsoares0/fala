"use client";

import { Fragment, useEffect, useRef } from "react";
import { activeBlockIndex, activeWordIndex, blockWords, formatTimecode, isNoSpaceLanguage } from "@fala/shared";
import { useEditor } from "./editor-store";

/**
 * The captions as text, in sync with playback: the active block shows karaoke-style
 * progress. Clicking a block plays from its start; clicking a word, from that word.
 * Editing arrives in Phase 4b.
 */
export function CaptionsPanel({ className = "" }: { className?: string }) {
  const track = useEditor((state) => state.track);
  const timeMs = useEditor((state) => state.timeMs);
  const seek = useEditor((state) => state.seek);
  const active = activeBlockIndex(track.blocks, timeMs);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const joiner = isNoSpaceLanguage(track.language) ? "" : " ";

  return (
    <section className={`min-h-0 min-w-0 flex-col ${className}`} aria-label="Captions">
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
          const spokenUpTo = isActive ? activeWordIndex(track.words, block, timeMs) : -1;
          return (
            <li
              key={block.id}
              ref={isActive ? activeRowRef : undefined}
              onClick={() => seek(block.startMs)}
              aria-current={isActive ? "true" : undefined}
              data-testid="caption-block"
              className={`flex cursor-pointer flex-col gap-1.5 rounded-[10px] px-3.5 pt-3 pb-3.5 transition-colors hover:bg-panel-1 ${
                isActive ? "bg-panel-1" : ""
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  seek(block.startMs);
                }}
                aria-label={`Play from ${formatTimecode(block.startMs)}`}
                className={`self-start font-mono text-[11.5px] tabular-nums ${isActive ? "text-accent" : "text-muted"}`}
              >
                {formatTimecode(block.startMs)} → {formatTimecode(block.endMs)}
              </button>
              <span dir="auto" className="text-[17px] leading-[1.45] tracking-[-0.005em]">
                {words.map((word, wordIndex) => (
                  <Fragment key={wordIndex}>
                    {wordIndex > 0 && joiner}
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        seek(word.startMs);
                      }}
                      className={`rounded-[4px] ${
                        !isActive
                          ? "text-[#cfc8bb] hover:bg-[rgba(236,230,218,.09)]"
                          : wordIndex === spokenUpTo
                            ? "-mx-[3px] bg-[rgba(255,90,31,.2)] px-[3px] text-white shadow-[inset_0_-2px_0_var(--color-accent)]"
                            : wordIndex < spokenUpTo
                              ? "text-text hover:bg-[rgba(236,230,218,.09)]"
                              : "text-muted hover:bg-[rgba(236,230,218,.09)]"
                      }`}
                    >
                      {word.text}
                    </span>
                  </Fragment>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
