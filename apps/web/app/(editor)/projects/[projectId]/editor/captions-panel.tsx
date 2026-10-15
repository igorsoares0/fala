"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  activeBlockIndex,
  activeWordIndex,
  blockFlag,
  blockWords,
  findMatches,
  formatTimecode,
  isNoSpaceLanguage,
  NUDGE_STEP_MS,
  type CaptionBlock,
} from "@fala/shared";
import { useEditor } from "./editor-store";
import { FindReplace } from "./find-replace";

/**
 * The captions as text (handoff §3, captions column): karaoke on the active block,
 * click to play from a block or a word, and — on the selected block — edit its text,
 * split between words, merge with the next block or nudge its timing.
 */
export function CaptionsPanel({ className = "" }: { className?: string }) {
  const track = useEditor((state) => state.track);
  const timeMs = useEditor((state) => state.timeMs);
  const selectedId = useEditor((state) => state.selectedId);
  const findOpen = useEditor((state) => state.findOpen);
  const setFindOpen = useEditor((state) => state.setFindOpen);
  const [query, setQuery] = useState("");
  const active = activeBlockIndex(track.blocks, timeMs);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Words matching the find query get a yellow underline in the list.
  const found = findOpen ? findMatches(track, query) : null;
  const matched = new Set(found?.kind === "matches" ? found.wordIndices : []);

  return (
    <section className={`min-h-0 min-w-0 flex-col ${className}`} aria-label="Captions">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-base font-bold tracking-[-0.01em]">Captions</h2>
          <span className="font-mono text-[11.5px] text-muted">{track.blocks.length} blocks</span>
        </div>
        <div className="flex items-center gap-3">
          {track.language && (
            <span className="hidden font-mono text-[11.5px] text-muted uppercase min-[1100px]:inline" title="Detected language">
              {track.language}
            </span>
          )}
          <button
            type="button"
            onClick={() => setFindOpen(!findOpen)}
            aria-expanded={findOpen}
            title="Replace word (Ctrl+F)"
            className="rounded-[9px] border border-line-button px-3 py-1.5 text-[13px] font-semibold text-text hover:border-[rgba(236,230,218,.35)]"
          >
            Replace
          </button>
        </div>
      </div>

      {findOpen && <FindReplace query={query} onQueryChange={setQuery} />}

      <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6">
        {track.blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            isActive={index === active}
            isSelected={block.id === selectedId}
            matched={matched}
            rowRef={index === active ? activeRowRef : undefined}
          />
        ))}
        {!selectedId && (
          <li className="px-3.5 pt-3 text-[12.5px] text-muted">Tip: select a block and click between two words to split it.</li>
        )}
      </ol>
    </section>
  );
}

const smallButton =
  "rounded-[7px] border border-line-button px-2.5 py-1 text-[12.5px] font-semibold text-text transition-colors hover:bg-panel-1 disabled:opacity-30";
const nudgeButton =
  "grid size-6 place-items-center rounded-md border border-line-button font-mono text-[13px] text-text hover:bg-panel-1";

function BlockRow({
  block,
  index,
  isActive,
  isSelected,
  matched,
  rowRef,
}: {
  block: CaptionBlock;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  matched: Set<number>;
  rowRef?: React.Ref<HTMLLIElement>;
}) {
  const track = useEditor((state) => state.track);
  const timeMs = useEditor((state) => (isActive ? state.timeMs : -1));
  const editing = useEditor((state) => state.editingId === block.id);
  const isLast = useEditor((state) => index === state.track.blocks.length - 1);
  const seek = useEditor((state) => state.seek);
  const select = useEditor((state) => state.select);
  const startEditing = useEditor((state) => state.startEditing);
  const split = useEditor((state) => state.split);
  const merge = useEditor((state) => state.merge);
  const nudge = useEditor((state) => state.nudge);

  const words = blockWords(track, block);
  const spokenUpTo = isActive ? activeWordIndex(track.words, block, timeMs) : -1;
  const joiner = isNoSpaceLanguage(track.language) ? "" : " ";
  const flag = blockFlag(track, block);

  function choose() {
    select(block.id);
    seek(block.startMs);
  }

  return (
    <li
      ref={rowRef}
      onClick={choose}
      aria-current={isActive ? "true" : undefined}
      data-selected={isSelected || undefined}
      data-testid="caption-block"
      className={`flex cursor-pointer flex-col gap-1.5 rounded-[10px] border px-3.5 pt-3 pb-3.5 transition-colors ${
        isSelected ? "border-[rgba(236,230,218,.16)] bg-panel-2" : isActive ? "border-transparent bg-panel-1" : "border-transparent hover:bg-panel-1"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            choose();
          }}
          aria-label={`Play from ${formatTimecode(block.startMs)}`}
          className={`font-mono text-[11.5px] tabular-nums ${isActive ? "text-accent" : "text-muted"}`}
        >
          {formatTimecode(block.startMs)} → {formatTimecode(block.endMs)}
        </button>
        {flag && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-warning">
            <span aria-hidden>◆</span>
            {flag}
          </span>
        )}
      </div>

      {editing ? (
        <EditText block={block} initial={words.map((word) => word.text).join(joiner)} />
      ) : (
        // Inline text with real spaces, so it reads (and copies) as words; split handles sit inline between them.
        <span dir="auto" className="text-[17px] leading-[1.45] tracking-[-0.005em]">
          {words.map((word, wordIndex) => {
            const globalIndex = block.wordStart + wordIndex;
            return (
              <Fragment key={wordIndex}>
                {wordIndex > 0 && joiner}
                {wordIndex > 0 && isSelected && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      split(block.id, globalIndex - 1);
                    }}
                    aria-label={`Split before “${word.text}”`}
                    title="Split here"
                    className="group mr-[0.28em] inline-grid h-[22px] w-3 cursor-col-resize place-items-center align-middle"
                  >
                    <span className="h-4 w-0.5 rounded-sm bg-[rgba(236,230,218,.25)] group-hover:bg-accent group-focus-visible:bg-accent" />
                  </button>
                )}
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    select(block.id);
                    seek(word.startMs);
                  }}
                  className={`rounded-[4px] ${matched.has(globalIndex) ? "underline decoration-[#ffd400] decoration-2 underline-offset-4" : ""} ${
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
            );
          })}
        </span>
      )}

      {isSelected && !editing && (
        <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={smallButton} onClick={() => startEditing(block.id)}>
            Edit text
          </button>
          <button type="button" className={smallButton} onClick={() => merge(block.id)} disabled={isLast}>
            Merge with next
          </button>
          <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1" role="group" aria-label="Block start">
              start
              <button type="button" className={nudgeButton} aria-label="Start 0.1 s earlier" onClick={() => nudge(block.id, "start", -NUDGE_STEP_MS)}>
                −
              </button>
              <button type="button" className={nudgeButton} aria-label="Start 0.1 s later" onClick={() => nudge(block.id, "start", NUDGE_STEP_MS)}>
                +
              </button>
            </span>
            <span className="flex items-center gap-1" role="group" aria-label="Block end">
              end
              <button type="button" className={nudgeButton} aria-label="End 0.1 s earlier" onClick={() => nudge(block.id, "end", -NUDGE_STEP_MS)}>
                −
              </button>
              <button type="button" className={nudgeButton} aria-label="End 0.1 s later" onClick={() => nudge(block.id, "end", NUDGE_STEP_MS)}>
                +
              </button>
            </span>
          </span>
        </div>
      )}
    </li>
  );
}

/** Textarea for a block's text: Enter applies, Esc cancels (handoff "Edit text"). */
function EditText({ block, initial }: { block: CaptionBlock; initial: string }) {
  const [draft, setDraft] = useState(initial);
  const applyText = useEditor((state) => state.applyText);
  const startEditing = useEditor((state) => state.startEditing);

  return (
    <div className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
      <textarea
        autoFocus
        dir="auto"
        aria-label="Caption text"
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyText(block.id, draft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            startEditing(null);
          }
        }}
        className="w-full resize-none rounded-lg border border-[rgba(236,230,218,.25)] bg-ink px-3 py-2 text-[17px] leading-[1.45] text-text outline-none focus:border-text"
      />
      <div className="flex items-center gap-2">
        <button type="button" className={`${smallButton} border-text bg-text text-ink hover:bg-white`} onClick={() => applyText(block.id, draft)}>
          Apply
        </button>
        <button type="button" className={smallButton} onClick={() => startEditing(null)}>
          Cancel
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted">enter applies · esc cancels</span>
      </div>
    </div>
  );
}
