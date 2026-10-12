// Where you've been, so you can step back out of a detour — the same
// move as Slack's back arrow. A location is just the part of the store
// that says what's on screen; the stack watches the store rather than
// asking every navigation action to remember to record itself.

import { create } from "zustand";

import { useKeyNav } from "./keyNav";
import type { ReviewTab } from "./keyNav";
import { useAppStore } from "./store";
import type { View } from "./storeTypes";

/** Deliberately shallow: five steps covers "I wandered off, take me
 * back" without turning into a browser history nobody prunes. */
const MAX_DEPTH = 5;

interface Location {
  view: View;
  repo: string | null;
  pr: number | null;
  tab: ReviewTab;
}

function current(): Location {
  const { view, selectedRepo, selectedPr } = useAppStore.getState();
  return { view, repo: selectedRepo, pr: selectedPr, tab: useKeyNav.getState().tab };
}

function same(a: Location, b: Location): boolean {
  return a.view === b.view && a.repo === b.repo && a.pr === b.pr && a.tab === b.tab;
}

interface NavHistory {
  past: Location[];
  push: (loc: Location) => void;
  pop: () => Location | undefined;
}

const useHistory = create<NavHistory>((set, get) => ({
  past: [],
  push: (loc) => {
    set((s) => ({ past: [...s.past, loc].slice(-MAX_DEPTH) }));
  },
  pop: () => {
    const last = get().past.at(-1);
    if (last === undefined) return undefined;
    set((s) => ({ past: s.past.slice(0, -1) }));
    return last;
  },
}));

/** True while `goBack` is applying a location — the store changes it
 * makes are the undo, not a new place worth remembering. */
let rewinding = false;

let previous = current();

function record(): void {
  const now = current();
  if (rewinding || same(now, previous)) return;
  useHistory.getState().push(previous);
  previous = now;
}

useAppStore.subscribe(record);
useKeyNav.subscribe(record);

export function useCanGoBack(): boolean {
  return useHistory((s) => s.past.length > 0);
}

export async function goBack(): Promise<void> {
  const target = useHistory.getState().pop();
  if (target === undefined) return;
  rewinding = true;
  try {
    const app = useAppStore.getState();
    useKeyNav.getState().setTab(target.tab);
    if (target.pr !== null && target.repo !== null) {
      // openPr sets the repo, loads the PR and switches to the review
      // view in one go — the same path a click down a list takes.
      await app.openPr(target.repo, target.pr);
    }
    useAppStore.getState().setView(target.view);
  } finally {
    rewinding = false;
    previous = current();
  }
}
