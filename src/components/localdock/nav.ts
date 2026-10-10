"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "shares"
  | "files"
  | "transfers"
  | "devices"
  | "websites"
  | "settings";

export interface FilesTarget {
  shareId: string;
  path: string;
  nonce?: number;
}

interface NavState {
  view: ViewKey;
  filesTarget: FilesTarget | null;
  go: (view: ViewKey, skipHistory?: boolean) => void;
  openFiles: (shareId: string, path?: string, skipHistory?: boolean) => void;
}

const NAV_STORAGE_KEY = "localdock.navState";

function loadInitialState(): { view: ViewKey; filesTarget: FilesTarget | null } {
  if (typeof window === "undefined") return { view: "dashboard", filesTarget: null };
  try {
    const raw = window.localStorage.getItem(NAV_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.view === "string") {
        return {
          view: parsed.view as ViewKey,
          filesTarget: parsed.filesTarget ?? null,
        };
      }
    }
  } catch {}
  return { view: "dashboard", filesTarget: null };
}

function persistNavState(view: ViewKey, filesTarget: FilesTarget | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ view, filesTarget }));
  } catch {}
}

const initial = loadInitialState();

export const useNav = create<NavState>((set, get) => {
  if (typeof window !== "undefined") {
    // Synchronize browser history / Android back button
    window.addEventListener("popstate", (e) => {
      const state = e.state as { view?: ViewKey; filesTarget?: FilesTarget } | null;
      if (state && state.view) {
        set({
          view: state.view,
          filesTarget: state.filesTarget ?? null,
        });
        persistNavState(state.view, state.filesTarget ?? null);
      } else {
        set({ view: "dashboard", filesTarget: null });
        persistNavState("dashboard", null);
      }
    });

    // Seed initial history entry if needed
    if (!window.history.state) {
      window.history.replaceState(
        { view: initial.view, filesTarget: initial.filesTarget },
        "",
        window.location.href
      );
    }
  }

  return {
    view: initial.view,
    filesTarget: initial.filesTarget,
    go: (view, skipHistory) => {
      const current = get();
      if (current.view === view && !current.filesTarget) return;
      if (!skipHistory && typeof window !== "undefined") {
        window.history.pushState({ view, filesTarget: null }, "", window.location.href);
      }
      persistNavState(view, null);
      set({ view, filesTarget: null });
    },
    openFiles: (shareId, path = "", skipHistory) => {
      const nextTarget: FilesTarget = {
        shareId,
        path,
        nonce: (get().filesTarget?.nonce ?? 0) + 1,
      };
      if (!skipHistory && typeof window !== "undefined") {
        window.history.pushState(
          { view: "files", filesTarget: nextTarget },
          "",
          window.location.href
        );
      }
      persistNavState("files", nextTarget);
      set({ view: "files", filesTarget: nextTarget });
    },
  };
});
