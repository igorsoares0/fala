import { useEffect } from "react";
import { saveProjectStyleAction } from "@/lib/style-actions";
import { useSaveStatus } from "@/lib/save-status";
import { useEditorStore, type EditorState } from "./editor-store";

const DEBOUNCE_MS = 600;

/**
 * Saves the style after edits settle. Requests are serialized — one in flight, and
 * whatever changed meanwhile is sent next — so an older save never lands last.
 */
export function useStyleAutosave() {
  const store = useEditorStore();
  const report = useSaveStatus((status) => status.report);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let pending = false;
    let disposed = false;

    const snapshot = (state: EditorState) => ({ presetKey: state.presetKey, style: state.styleConfig });

    async function flush() {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      pending = false;
      const state = store.getState();
      report("style", { state: "saving" });
      const result = await saveProjectStyleAction(state.projectId, snapshot(state)).catch(() => null);
      inFlight = false;
      if (disposed) return;
      if (pending) return void flush();
      if (result?.ok) report("style", { state: "saved" });
      else report("style", { state: "error", error: result?.error ?? "Couldn't reach the server.", retry: () => void flush() });
    }

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.presetKey === previous.presetKey && state.styleConfig === previous.styleConfig) return;
      report("style", { state: "saving" });
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      unsubscribe();
      // Leaving with a change still waiting: send it now rather than dropping it.
      if (timer) {
        clearTimeout(timer);
        const state = store.getState();
        void saveProjectStyleAction(state.projectId, snapshot(state));
      }
    };
  }, [store, report]);
}
