// localStorage-backed UI preferences (theme, pane pins).

import type { Theme } from "./storeTypes";

const THEME_KEY = "tandem-theme";

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
