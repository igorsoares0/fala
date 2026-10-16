"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
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
  type CaptionTrack,
  type TranscriptWord,
} from "@fala/shared";
import { useEditor, useEditorStore } from "./editor-store";
import { FindReplace } from "./find-replace";

/**
 * The captions as text (handoff §3, captions column): karaoke on the active block,
 * click to play from a block or a word, and — on the selected block — edit its text,
 * split between words, merge with the next block or nudge its timing.
 */
export function CaptionsPanel({ className = "" }: { className?: string }) {
  const track = useEditor((state) => state.track);
  // A number, not the clock: the list re-renders when the active block changes, not on every video frame.
  const active = useEditor((state) => activeBlockIndex(state.track.blocks, state.timeMs));
  const selectedId = useEditor((state) => state.selectedId);
  const editingId = useEditor((state) => state.editingId);
  const findOpen = useEditor((state) => state.findOpen);
  const setFindOpen = useEditor((state) => state.setFindOpen);
  const [query, setQuery] = useState("");
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    // Follow playback, but only scroll when the active row has left the visible part of the list.
    const row = activeRowRef.current;
    const list = listRef.current;
    if (!row || !list) return;
    const rowBox = row.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    if (rowBox.top < listBox.top || rowBox.bottom > listBox.bottom) row.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Words matching the find query get a yellow underline in the list.
  const matched = useMemo(() => {
    const found = findOpen ? findMatches(track, query) : null;
    return new Set(found?.kind === "matches" ? found.wordIndices : []);
  }, [findOpen, track, query]);

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

      <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6 [contain:content]">
        {track.blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            track={track}
            block={block}
            isActive={index === active}
            isSelected={block.id === selectedId}
            isEditing={block.id === editingId}
            isLast={index === track.blocks.length - 1}
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

type BlockRowProps = {
  track: CaptionTrack;
  block: CaptionBlock;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isLast: boolean;
  matched: Set<number>;
  rowRef?: React.Ref<HTMLLIElement>;
};

/**
 * Re-render a row only when something it shows changed. An edit replaces the whole
 * track, but most rows' blocks and words are the same objects as before.
 */
function sameRow(previous: BlockRowProps, next: BlockRowProps) {
  if (
    previous.block !== next.block ||
    previous.isActive !== next.isActive ||
    previous.isSelected !== next.isSelected ||
    previous.isEditing !== next.isEditing ||
    previous.isLast !== next.isLast ||
    previous.matched !== next.matched ||
    previous.rowRef !== next.rowRef ||
    previous.track.language !== next.track.language
  ) {
    return false;
  }
  for (let index = next.block.wordStart; index <= next.block.wordEnd; index++) {
    if (previous.track.words[index] !== next.track.words[index]) return false;
  }
  return true;
}

/**
 * One block. Rows hold no store subscriptions of their own: with thousands of blocks,
 * per-row subscriptions alone would cost more than a video frame. Only the active
 * row follows the clock (for the karaoke), through <SpokenWords>.
 */
const BlockRow = memo(function BlockRow({ track, block, isActive, isSelected, isEditing, isLast, matched, rowRef }: BlockRowProps) {
  const store = useEditorStore();
  const words = blockWords(track, block);
  const joiner = isNoSpaceLanguage(track.language) ? "" : " ";
  const flag = blockFlag(track, block);
  const editor = () => store.getState();

  function choose() {
    editor().select(block.id);
    editor().seek(block.startMs);
  }

  const wordProps = { block, words, joiner, isSelected, matched };

  return (
    <li
      ref={rowRef}
      onClick={choose}
      aria-current={isActive ? "true" : undefined}
      data-selected={isSelected || undefined}
      data-testid="caption-block"
      // Off-screen rows skip layout and paint: long videos have thousands of blocks.
      className={`flex cursor-pointer flex-col gap-1.5 rounded-[10px] border px-3.5 pt-3 pb-3.5 transition-colors [contain-intrinsic-size:auto_84px] [content-visibility:auto] ${
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

      {isEditing ? (
        <EditText block={block} initial={words.map((word) => word.text).join(joiner)} />
      ) : isActive ? (
        <SpokenWords {...wordProps} />
      ) : (
        <Words {...wordProps} spokenUpTo={null} />
      )}

      {isSelected && !isEditing && (
        <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={smallButton} onClick={() => editor().startEditing(block.id)}>
            Edit text
          </button>
          <button type="button" className={smallButton} onClick={() => editor().merge(block.id)} disabled={isLast}>
            Merge with next
          </button>
          <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1" role="group" aria-label="Block start">
              start
              <button type="button" className={nudgeButton} aria-label="Start 0.1 s earlier" onClick={() => editor().nudge(block.id, "start", -NUDGE_STEP_MS)}>
                −
              </button>
              <button type="button" className={nudgeButton} aria-label="Start 0.1 s later" onClick={() => editor().nudge(block.id, "start", NUDGE_STEP_MS)}>
                +
              </button>
            </span>
            <span className="flex items-center gap-1" role="group" aria-label="Block end">
              end
              <button type="button" className={nudgeButton} aria-label="End 0.1 s earlier" onClick={() => editor().nudge(block.id, "end", -NUDGE_STEP_MS)}>
                −
              </button>
              <button type="button" className={nudgeButton} aria-label="End 0.1 s later" onClick={() => editor().nudge(block.id, "end", NUDGE_STEP_MS)}>
                +
              </button>
            </span>
          </span>
        </div>
      )}
    </li>
  );
}, sameRow);

type WordsProps = {
  block: CaptionBlock;
  words: TranscriptWord[];
  joiner: string;
  isSelected: boolean;
  matched: Set<number>;
};

/** The active row's words, following the clock: re-renders once per spoken word, not per frame. */
function SpokenWords(props: WordsProps) {
  const spokenUpTo = useEditor((state) => activeWordIndex(state.track.words, props.block, state.timeMs));
  return <Words {...props} spokenUpTo={spokenUpTo} />;
}

/** Inline text with real spaces, so it reads (and copies) as words; split handles sit inline between them. */
function Words({ block, words, joiner, isSelected, matched, spokenUpTo }: WordsProps & { spokenUpTo: number | null }) {
  const store = useEditorStore();
  return (
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
                  store.getState().split(block.id, globalIndex - 1);
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
                store.getState().select(block.id);
                store.getState().seek(word.startMs);
              }}
              className={`rounded-[4px] ${matched.has(globalIndex) ? "underline decoration-[#ffd400] decoration-2 underline-offset-4" : ""} ${
                spokenUpTo === null
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
