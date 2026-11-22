"use client";

import { useRef, useState } from "react";
import { outlineButton, smallCreamButton } from "@/components/ui";
import type { ToolSlug } from "@/lib/pseo/routes";
import { CONVERTERS, SubtitleError } from "@/lib/pseo/subtitles";

const PLACEHOLDERS: Record<string, string> = {
  srt: "1\n00:00:01,000 --> 00:00:02,500\nHello there.",
  vtt: "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello there.",
};

/** Subtitle files are small; anything bigger is almost certainly the wrong file. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * The free converter: reads a dropped, chosen or pasted file and converts it in the
 * browser. Nothing is uploaded.
 */
export function Converter({ tool }: { tool: ToolSlug }) {
  const { from, to, mimeType, convert } = CONVERTERS[tool];
  const [input, setInput] = useState("");
  const [baseName, setBaseName] = useState("subtitles");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function run(text: string) {
    setCopied(false);
    try {
      setOutput(convert(text));
      setError("");
    } catch (caught) {
      setOutput("");
      setError(caught instanceof SubtitleError ? caught.message : "This file couldn't be converted.");
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setOutput("");
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Subtitle files are much smaller: check it's a .${from} file.`);
      return;
    }
    const text = await file.text();
    setBaseName(file.name.replace(/\.[^.]+$/, "") || "subtitles");
    setInput(text);
    run(text);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([output], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.${to}`;
    link.click();
    // Revoked on the next tick: some browsers start the download asynchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setError("Copying isn't allowed here. Select the text and copy it instead.");
    }
  }

  return (
    <div className="grid gap-4 min-[900px]:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void readFile(event.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-2 rounded-[16px] border border-dashed px-5 py-6 text-center transition-colors ${
            dragging ? "border-text bg-panel-2" : "border-line-strong bg-panel-1"
          }`}
        >
          <span className="text-[15px] font-semibold">Drop a .{from} file here</span>
          <button type="button" className={outlineButton} onClick={() => fileInput.current?.click()}>
            Choose file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={`.${from},text/plain,text/vtt`}
            className="sr-only"
            tabIndex={-1}
            aria-label={`Choose a .${from} file`}
            onChange={(event) => {
              void readFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Or paste the {from.toUpperCase()} text</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={PLACEHOLDERS[from]}
            className="min-h-[240px] w-full resize-y rounded-[12px] border border-line-input bg-panel-1 px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-muted focus:border-text"
          />
        </label>
        <button type="button" className={smallCreamButton} onClick={() => run(input)}>
          Convert to {to.toUpperCase()}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">{to.toUpperCase()} result</span>
          <textarea
            value={output}
            readOnly
            spellCheck={false}
            rows={16}
            placeholder="The converted file appears here."
            className="min-h-[320px] w-full resize-y rounded-[12px] border border-line-input bg-panel-1 px-3.5 py-3 font-mono text-[13px] text-text outline-none placeholder:text-muted focus:border-text"
          />
        </label>
        {error && (
          <p role="alert" className="text-[14px] text-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallCreamButton} onClick={download} disabled={!output}>
            Download .{to}
          </button>
          <button type="button" className={outlineButton} onClick={copy} disabled={!output}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
