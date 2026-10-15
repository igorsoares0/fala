"use client";

import { useEffect, useRef, useState } from "react";
import { findMatches } from "@fala/shared";
import { useEditor } from "./editor-store";

/**
 * Find & replace (handoff §3): one word at a time, whole-word and accent-insensitive.
 * Replacing keeps every timing. The query lives in the captions panel so matches can
 * be underlined in the list.
 */
export function FindReplace({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const track = useEditor((state) => state.track);
  const replaceAll = useEditor((state) => state.replaceAll);
  const setFindOpen = useEditor((state) => state.setFindOpen);
  const [replacement, setReplacement] = useState("");
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findRef.current?.focus();
  }, []);

  const found = findMatches(track, query);
  const count = found.kind === "matches" ? found.wordIndices.length : 0;
  const canReplace = count > 0 && replacement.trim().length > 0;

  const status =
    found.kind === "empty"
      ? "Type the word the transcript got wrong"
      : found.kind === "multi-word"
        ? "Search one word at a time"
        : count === 0
          ? "No matches"
          : `${count} ${count === 1 ? "match" : "matches"} in ${found.blockCount} ${found.blockCount === 1 ? "block" : "blocks"}`;

  function replace() {
    if (!canReplace) return;
    replaceAll(query, replacement);
    onQueryChange("");
    setReplacement("");
    findRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      replace();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFindOpen(false);
    }
  }

  const input =
    "w-full rounded-[9px] border border-line-input bg-ink px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-text";

  return (
    <div className="mx-3 mb-3 flex flex-col gap-3 rounded-xl border border-line bg-panel-1 p-3.5" role="search" aria-label="Find and replace">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        <input
          ref={findRef}
          aria-label="Wrong word"
          placeholder="Wrong word"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          className={input}
        />
        <input
          aria-label="Replace with"
          placeholder="Replace with"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={onKeyDown}
          className={input}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={`font-mono text-[11.5px] ${count > 0 ? "text-[#ffd400]" : "text-muted"}`} aria-live="polite">
          {status}
        </span>
        <button
          type="button"
          onClick={replace}
          disabled={!canReplace}
          className="rounded-[9px] bg-text px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {count > 1 ? "Replace all" : "Replace"}
        </button>
      </div>
    </div>
  );
}
