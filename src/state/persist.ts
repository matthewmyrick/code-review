// localStorage-backed UI preferences (theme, pane pins, sort order).

import type { PrSort } from "../lib/sort";
import type { Theme } from "./storeTypes";

const THEME_KEY = "tandem-theme";
export const PR_SORT_KEY = "tandem-pr-sort";

export function loadTheme(): Theme {
  // Light is the default; dark only when explicitly chosen.
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function loadPinned(key: string): boolean {
  return localStorage.getItem(key) !== "false";
}

export function loadPrSort(): PrSort {
  const saved = localStorage.getItem(PR_SORT_KEY);
  const valid: PrSort[] = [
    "opened-asc",
    "opened-desc",
    "updated-desc",
    "number-asc",
    "number-desc",
  ];
  return valid.includes(saved as PrSort) ? (saved as PrSort) : "opened-asc";
}
