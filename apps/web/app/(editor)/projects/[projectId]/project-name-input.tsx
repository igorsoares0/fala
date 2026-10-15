"use client";

import { useRef, useState, useTransition } from "react";
import { PROJECT_NAME_MAX_LENGTH } from "@fala/shared";
import { renameProjectAction } from "@/lib/project-actions";

type SaveState = "saved" | "saving" | "error";

const SAVE_INDICATOR: Record<SaveState, { dot: string; label: string }> = {
  saved: { dot: "bg-success", label: "Saved" },
  saving: { dot: "bg-warning", label: "Saving…" },
  error: { dot: "bg-danger", label: "Not saved" },
};

export function ProjectNameInput({ projectId, initialName }: { projectId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function save() {
    const next = name.replace(/\s+/g, " ").trim();
    if (next === savedName) {
      setName(savedName);
      return;
    }
    if (next.length === 0) {
      setName(savedName);
      return;
    }
    setState("saving");
    setError(null);
    startSaving(async () => {
      const result = await renameProjectAction(projectId, next);
      if (result.ok) {
        setSavedName(next);
        setName(next);
        setState("saved");
      } else {
        setState("error");
        setError(result.error);
      }
    });
  }

  const indicator = SAVE_INDICATOR[state];

  return (
    <div className="flex min-w-0 items-center gap-3">
      <input
        ref={inputRef}
        aria-label="Project name"
        value={name}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") inputRef.current?.blur();
          if (event.key === "Escape") {
            setName(savedName);
            requestAnimationFrame(() => inputRef.current?.blur());
          }
        }}
        className="w-[min(320px,40vw)] min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-[15px] font-semibold text-text outline-none transition-colors hover:border-line-strong focus:border-line-strong focus:bg-panel-1"
      />
      <span className="flex items-center gap-2 font-mono text-[11.5px] text-muted" role="status" title={error ?? undefined}>
        <span className={`size-1.5 rounded-full ${indicator.dot}`} aria-hidden />
        <span className="max-sm:sr-only">{indicator.label}</span>
      </span>
    </div>
  );
}
