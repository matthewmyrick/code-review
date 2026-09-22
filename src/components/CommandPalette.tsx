// ⌘K palette: fuzzy jump to any pull request Tandem has loaded (current
// repo list, all inbox tabs, search results). Read-only navigation.

import { GitPullRequest, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzyScore } from "../lib/fuzzy";
import type { PullRequest } from "../lib/types";
import { useKeyNav } from "../state/keyNav";
import { useAppStore } from "../state/store";

interface Item {
  slug: string;
  number: number;
  title: string;
  author: string;
}

function collectItems(): Item[] {
  const s = useAppStore.getState();
  const all: PullRequest[] = [
    ...s.prs,
    ...Object.values(s.inbox).flatMap((list) => list),
    ...(s.searchResults ?? []),
  ];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const pr of all) {
    const slug = `${pr.repo.owner}/${pr.repo.name}`;
    const key = `${slug}#${String(pr.number)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ slug, number: pr.number, title: pr.title, author: pr.author.login });
  }
  return items;
}

export function CommandPalette() {
  const open = useKeyNav((s) => s.paletteOpen);
  const setPalette = useKeyNav((s) => s.setPalette);
  const openPr = useAppStore((s) => s.openPr);
  const setView = useAppStore((s) => s.setView);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after the overlay mounts.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo(() => (open ? collectItems() : []), [open]);
  const matches = useMemo(() => {
    if (!query.trim()) return items.slice(0, 15);
    return items
      .map((item) => ({
        item,
        rank: fuzzyScore(
          query,
          `#${String(item.number)} ${item.title} ${item.slug} ${item.author}`,
        ),
      }))
      .filter((x): x is { item: Item; rank: number } => x.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 15)
      .map((x) => x.item);
  }, [items, query]);

  if (!open) return null;

  const jump = (item: Item) => {
    setPalette(false);
    setView("review");
    void openPr(item.slug, item.number);
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15%] backdrop-blur-sm"
      onMouseDown={() => {
        setPalette(false);
      }}
    >
      <div
        className="animate-fade-up w-[min(90%,36rem)] overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(matches.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                const item = matches[cursor];
                if (item) jump(item);
              } else if (e.key === "Escape") {
                setPalette(false);
              }
            }}
            placeholder="jump to a pull request — number, title, repo, author…"
            className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-muted"
          />
          <kbd className="shrink-0 rounded border border-edge px-1 text-[9px] text-muted">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">
              no loaded PRs match — try the sidebar search for a server-side lookup
            </div>
          ) : (
            matches.map((item, i) => (
              <button
                key={`${item.slug}#${String(item.number)}`}
                type="button"
                onClick={() => {
                  jump(item);
                }}
                onMouseEnter={() => {
                  setCursor(i);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  i === cursor ? "bg-panel-2" : ""
                }`}
              >
                <GitPullRequest size={12} className="shrink-0 text-sky" />
                <span className="shrink-0 font-medium text-sky">#{item.number}</span>
                <span className="truncate text-cream">{item.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                  {item.slug}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
