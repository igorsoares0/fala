"use client";

import { useRef, useState, type DragEvent } from "react";
import { formatBytes, UPLOAD_LIMITS } from "@fala/shared";
import { VIDEO_FILE_ACCEPT } from "@/lib/check-video-file";

export function DropZoneTile({ onFile, busy, maxVideoMs }: { onFile: (file: File) => void; busy: boolean; maxVideoMs: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={busy}
        className={`flex aspect-[9/16] flex-col items-center justify-center gap-[18px] rounded-xl border-[1.5px] border-dashed transition-colors disabled:cursor-progress ${
          dragging
            ? "border-accent bg-[rgba(255,90,31,.08)]"
            : "border-[rgba(236,230,218,.22)] hover:border-[rgba(236,230,218,.4)] hover:bg-panel-1"
        }`}
      >
        <span className="grid size-[52px] place-items-center rounded-full bg-text text-[28px] leading-none text-ink" aria-hidden>
          +
        </span>
        <span className="flex flex-col items-center gap-1.5 px-3.5 text-center">
          <span className="text-[17px] font-bold tracking-[-0.02em]">
            {busy ? "Creating…" : dragging ? "Drop it" : "New video"}
          </span>
          <span className="text-[13px] text-pretty text-muted">Drag a file or click to choose</span>
        </span>
        <span className="text-center font-mono text-[10.5px] leading-[1.6] text-muted">
          MP4 · MOV · WEBM
          <br />
          up to {maxVideoMs / 60_000} min · {formatBytes(UPLOAD_LIMITS.maxBytes)}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_FILE_ACCEPT}
        className="hidden"
        data-testid="new-video-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
