"use client";

import { useEffect, useState } from "react";
import { CaptionsPanel } from "./captions-panel";
import { EditorStoreProvider, type EditorInit } from "./editor-store";
import { useEditorUi } from "./editor-ui";
import { PreviewPanel } from "./preview-panel";
import { StylePanel } from "./style-panel";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useStyleAutosave } from "./use-style-autosave";

type Props = EditorInit & { width: number | null; height: number | null; posterSrc: string };

/**
 * The editor for a project with captions (handoff §3):
 * ≥1100px three columns (captions · preview · style); 720–1099px captions + preview
 * with style in a drawer; <720px preview on top and Captions | Style tabs.
 */
export function EditorShell({ width, height, posterSrc, ...init }: Props) {
  return (
    <EditorStoreProvider init={init}>
      <EditorLayout width={width} height={height} posterSrc={posterSrc} />
    </EditorStoreProvider>
  );
}

function EditorLayout({ width, height, posterSrc }: { width: number | null; height: number | null; posterSrc: string }) {
  useStyleAutosave();
  useEditorShortcuts();
  const [tab, setTab] = useState<"captions" | "style">("captions");
  const drawerOpen = useEditorUi((ui) => ui.drawerOpen);
  const setDrawerOpen = useEditorUi((ui) => ui.setDrawerOpen);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, setDrawerOpen]);
  // The drawer is per editor visit.
  useEffect(() => () => setDrawerOpen(false), [setDrawerOpen]);

  const tabButton = (value: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`min-h-11 flex-1 text-[14px] font-semibold transition-colors ${
        tab === value ? "border-b-2 border-text text-text" : "border-b-2 border-transparent text-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col min-[720px]:flex-row">
      <CaptionsPanel
        className={`order-3 flex-1 min-[720px]:order-1 min-[720px]:flex min-[720px]:min-w-[270px] min-[720px]:border-r min-[720px]:border-line ${
          tab === "captions" ? "flex" : "hidden"
        }`}
      />
      <PreviewPanel
        width={width}
        height={height}
        posterSrc={posterSrc}
        className="order-1 shrink-0 [--preview-height:calc(40vh+210px)] min-[720px]:order-2 min-[720px]:flex-[1.15] min-[720px]:[--preview-height:100vh] min-[720px]:min-w-[320px]"
      />
      <div role="tablist" aria-label="Editor panels" className="order-2 flex shrink-0 border-b border-line min-[720px]:hidden">
        {tabButton("captions", "Captions")}
        {tabButton("style", "Style")}
      </div>

      {drawerOpen && (
        <div
          aria-hidden
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 top-14 z-10 hidden bg-[rgba(8,7,6,.5)] min-[720px]:max-[1099px]:block"
        />
      )}
      <StylePanel
        onClose={() => setDrawerOpen(false)}
        className={[
          "order-3",
          tab === "style" ? "flex" : "hidden",
          // 720–1099px: right drawer.
          "min-[720px]:max-[1099px]:fixed min-[720px]:max-[1099px]:top-14 min-[720px]:max-[1099px]:right-0 min-[720px]:max-[1099px]:bottom-0 min-[720px]:max-[1099px]:z-20",
          "min-[720px]:max-[1099px]:flex min-[720px]:max-[1099px]:w-[min(340px,92vw)] min-[720px]:max-[1099px]:border-l min-[720px]:max-[1099px]:border-line min-[720px]:max-[1099px]:bg-panel-1",
          "min-[720px]:max-[1099px]:transition-transform min-[720px]:max-[1099px]:duration-300 min-[720px]:max-[1099px]:ease-[cubic-bezier(.2,.8,.2,1)]",
          drawerOpen
            ? "min-[720px]:max-[1099px]:translate-x-0 min-[720px]:max-[1099px]:shadow-[-30px_0_80px_-20px_rgba(0,0,0,.8)]"
            : "min-[720px]:max-[1099px]:translate-x-[105%] min-[720px]:max-[1099px]:invisible",
          // ≥1100px: third column.
          "min-[1100px]:order-3 min-[1100px]:flex min-[1100px]:w-[310px] min-[1100px]:shrink-0 min-[1100px]:border-l min-[1100px]:border-line",
        ].join(" ")}
      />
    </main>
  );
}
