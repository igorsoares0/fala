"use client";

import { useRef, useState, useTransition } from "react";
import { PROJECT_NAME_MAX_LENGTH } from "@fala/shared";
import { renameProjectAction } from "@/lib/project-actions";
import { useSaveStatus } from "@/lib/save-status";

/** Inline project name: saves on blur or Enter, Esc reverts. Reports to the header's save indicator. */
export function ProjectNameInput({ projectId, initialName }: { projectId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const report = useSaveStatus((store) => store.report);
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
    report("name", { state: "saving" });
    startSaving(async () => {
      const result = await renameProjectAction(projectId, next);
      if (result.ok) {
        setSavedName(next);
        setName(next);
        report("name", { state: "saved" });
      } else {
        report("name", { state: "error", error: result.error, retry: save });
      }
    });
  }

  return (
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
  );
}
