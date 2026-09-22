// Global keyboard shortcuts: one keydown listener, dispatching to store
// actions. Single letters are dead while typing; ⌘-chords work anywhere.
// GitHub writes are deliberately NOT bindable — see lib/shortcuts.ts.

import { useEffect } from "react";

import { loadAgent } from "../state/persist";
import { useKeyNav } from "../state/keyNav";
import type { SidebarTab } from "../state/keyNav";
import { useAppStore } from "../state/store";
import { useModalHold } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";

const TAB_ORDER: SidebarTab[] = ["requested", "authored", "mentions", "open"];

function inEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Scroll to the next/prev diff anchor relative to the viewport top. */
function scrollDiff(selector: string, dir: 1 | -1) {
  const container = document.getElementById("diff-scroll");
  if (!container) return;
  const top = container.getBoundingClientRect().top;
  const els = [...container.querySelectorAll<HTMLElement>(selector)];
  const target =
    dir === 1
      ? els.find((el) => el.getBoundingClientRect().top - top > 8)
      : [...els].reverse().find((el) => el.getBoundingClientRect().top - top < -8);
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** The file section currently at (or above) the top of the diff view. */
function currentFileSection(): HTMLElement | null {
  const container = document.getElementById("diff-scroll");
  if (!container) return null;
  const top = container.getBoundingClientRect().top;
  const els = [...container.querySelectorAll<HTMLElement>("section[data-nav-file]")];
  return els.filter((el) => el.getBoundingClientRect().top - top <= 8).at(-1) ?? els[0] ?? null;
}

export function ShortcutManager() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = useKeyNav.getState();
      const app = useAppStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      // ⌘-chords work everywhere, even while typing.
      if (meta && !e.altKey) {
        const chord: Record<string, () => void> = {
          k: () => {
            nav.setPalette(!nav.paletteOpen);
          },
          "1": () => {
            app.setView("review");
          },
          "2": () => {
            app.setView("agents");
          },
          ",": () => {
            app.setView("settings");
          },
          b: () => {
            app.togglePinned(e.shiftKey ? "right" : "left");
          },
        };
        const run = chord[e.key.toLowerCase()];
        if (run) {
          e.preventDefault();
          run();
        }
        return;
      }

      // Overlays swallow everything else (they handle their own keys).
      if (nav.paletteOpen || nav.helpOpen) {
        if (e.key === "Escape") {
          nav.setPalette(false);
          nav.setHelp(false);
        }
        return;
      }
      if (inEditable(e.target)) return;

      const cursorTarget = nav.list[nav.cursor];
      const single: Record<string, () => void> = {
        j: () => {
          nav.moveCursor(1);
        },
        k: () => {
          nav.moveCursor(-1);
        },
        r: () => {
          if (nav.tab === "open") void app.refreshPrs();
          else void app.loadInbox(nav.tab, true);
          if (app.bundle) void app.refreshBundle();
        },
        "?": () => {
          nav.setHelp(true);
        },
        "]": () => {
          scrollDiff("section[data-nav-file]", 1);
        },
        "[": () => {
          scrollDiff("section[data-nav-file]", -1);
        },
        n: () => {
          scrollDiff("[data-nav-thread]", 1);
        },
        p: () => {
          scrollDiff("[data-nav-thread]", -1);
        },
        x: () => {
          currentFileSection()?.querySelector<HTMLElement>(":scope > button")?.click();
        },
        a: () => {
          const specs = app.agentSpecs;
          const last = loadAgent();
          const agent = specs.some((s) => s.name === last) ? last : (specs[0]?.name ?? "");
          if (agent && app.bundle) void app.startAgentReview(agent);
        },
        A: () => {
          app.setView("agents");
        },
      };
      TAB_ORDER.forEach((tab, i) => {
        single[String(i + 1)] = () => {
          nav.setTab(tab);
          app.setView("review");
        };
      });

      if (e.key === "Enter") {
        // Let focused buttons/links activate natively.
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, a, summary, [role='button']")) return;
        if (cursorTarget) {
          e.preventDefault();
          app.setView("review");
          void app.openPr(cursorTarget.slug, cursorTarget.number);
        }
        return;
      }
      if (e.key === "Escape") {
        // Modals close ONLY via their ✕ (deliberate); Esc means "back".
        if (useModalHold.getState().count > 0) return;
        app.goHome();
        return;
      }

      const run = single[e.key];
      if (run) {
        e.preventDefault();
        run();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <CommandPalette />
      <ShortcutHelp />
    </>
  );
}
