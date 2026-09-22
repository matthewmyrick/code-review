// Keyboard-navigation state shared between the shortcut manager and the
// sidebar lists: which tab is active, the flat ordered PR list currently
// visible (published by whichever list renders), and the j/k cursor.

import { create } from "zustand";

import type { InboxScope } from "../lib/types";

export type SidebarTab = "open" | InboxScope;

// v2: the default tab moved to "requested" — key bump lands everyone
// there once while still honoring later manual choices.
const TAB_KEY = "tandem-sidebar-tab-v2";

export function loadSidebarTab(): SidebarTab {
  const saved = localStorage.getItem(TAB_KEY);
  return saved === "open" || saved === "mentions" || saved === "authored" ? saved : "requested";
}

export interface NavTarget {
  slug: string;
  number: number;
}

interface KeyNavStore {
  tab: SidebarTab;
  setTab: (tab: SidebarTab) => void;
  /** Ordered PRs currently visible in the sidebar list. */
  list: NavTarget[];
  setList: (list: NavTarget[]) => void;
  /** j/k cursor index into `list`; -1 = nothing highlighted yet. */
  cursor: number;
  moveCursor: (delta: number) => void;
  paletteOpen: boolean;
  setPalette: (open: boolean) => void;
  helpOpen: boolean;
  setHelp: (open: boolean) => void;
}

export const useKeyNav = create<KeyNavStore>((set) => ({
  tab: loadSidebarTab(),
  setTab: (tab) => {
    localStorage.setItem(TAB_KEY, tab);
    set({ tab, cursor: -1 });
  },

  list: [],
  setList: (list) => {
    set((s) => ({ list, cursor: Math.min(s.cursor, list.length - 1) }));
  },

  cursor: -1,
  moveCursor: (delta) => {
    set((s) => {
      if (s.list.length === 0) return {};
      const next = s.cursor === -1 && delta > 0 ? 0 : s.cursor + delta;
      return { cursor: Math.max(0, Math.min(s.list.length - 1, next)) };
    });
  },

  paletteOpen: false,
  setPalette: (open) => {
    set({ paletteOpen: open });
  },
  helpOpen: false,
  setHelp: (open) => {
    set({ helpOpen: open });
  },
}));

/** Is this row the current j/k cursor target? */
export function useIsCursor(slug: string, number: number): boolean {
  return useKeyNav((s) => {
    const t = s.list[s.cursor];
    return t?.slug === slug && t.number === number;
  });
}
