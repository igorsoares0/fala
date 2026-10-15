import { create } from "zustand";

/** Editor chrome shared by the header (server-rendered) and the body: the style drawer at 720–1099px. */
export const useEditorUi = create<{ drawerOpen: boolean; setDrawerOpen: (open: boolean) => void }>((set) => ({
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
