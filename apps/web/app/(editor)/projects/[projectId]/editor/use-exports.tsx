"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isActiveExport, type ExportResolution } from "@fala/shared";
import type { ExportView } from "@/lib/exports";
import { useEditorStore } from "./editor-store";

/**
 * The project's exports for the editor: the header's Export button and the export
 * dialog read the same list. It's refreshed every 1.5 s only while a render is
 * queued or running, so the progress climbs without a page reload.
 */

const POLL_INTERVAL_MS = 1_500;

type StartResult = { ok: true } | { ok: false; error: string };

type ExportsContext = {
  exports: ExportView[];
  /** The newest export, whatever its state. */
  latest: ExportView | null;
  /** Highest resolution the user's plan exports. */
  maxResolution: ExportResolution;
  /** Why exporting is impossible for this project (its original was removed), or null. */
  blocked: string | null;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  start: (resolution: ExportResolution) => Promise<StartResult>;
  retry: (exportId: string) => Promise<StartResult>;
};

const Context = createContext<ExportsContext | null>(null);

export function ExportsProvider({
  initial,
  maxResolution,
  blocked,
  children,
}: {
  initial: ExportView[];
  maxResolution: ExportResolution;
  blocked: string | null;
  children: React.ReactNode;
}) {
  const store = useEditorStore();
  const [exports, setExports] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const projectId = store.getState().projectId;
  const rendering = exports.some((item) => isActiveExport(item.status));

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/exports`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setExports(((await response.json()) as { exports: ExportView[] }).exports);
  }, [projectId]);

  useEffect(() => {
    if (!rendering) return;
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rendering, refresh]);

  /** Upserts the export the server answered with, newest first. */
  const adopt = useCallback((item: ExportView) => {
    setExports((current) => [item, ...current.filter((other) => other.id !== item.id)].sort((a, b) => b.version - a.version));
  }, []);

  const start = useCallback(
    async (resolution: ExportResolution): Promise<StartResult> => {
      // The snapshot is taken on the server: it must already have every edit on screen.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!(await store.getState().flushSaves())) {
          return { ok: false, error: "Your latest changes haven't saved yet. Check your connection, then try again." };
        }
        const response = await fetch(`/api/projects/${projectId}/exports`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolution, captionVersion: store.getState().version }),
        }).catch(() => null);
        if (!response) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
        const body = (await response.json().catch(() => ({}))) as { export?: ExportView; error?: string; reason?: string };
        if (response.ok && body.export) {
          adopt(body.export);
          return { ok: true };
        }
        // A save landed between the flush and the request: flush again and retry once.
        if (body.reason !== "unsaved") return { ok: false, error: body.error ?? "Couldn't start the render." };
      }
      return { ok: false, error: "Your latest changes are still saving. Try again in a moment." };
    },
    [store, projectId, adopt],
  );

  const retry = useCallback(
    async (exportId: string): Promise<StartResult> => {
      const response = await fetch(`/api/exports/${exportId}/retry`, { method: "POST" }).catch(() => null);
      const body = (await response?.json().catch(() => ({}))) as { export?: ExportView; error?: string } | undefined;
      if (response?.ok && body?.export) {
        adopt(body.export);
        return { ok: true };
      }
      return { ok: false, error: body?.error ?? "Couldn't reach the server. Check your connection and try again." };
    },
    [adopt],
  );

  const value = useMemo(
    () => ({ exports, latest: exports[0] ?? null, maxResolution, blocked, dialogOpen, setDialogOpen, start, retry }),
    [exports, maxResolution, blocked, dialogOpen, start, retry],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useExports(): ExportsContext {
  const value = useContext(Context);
  if (!value) throw new Error("useExports must be used inside <ExportsProvider>.");
  return value;
}
