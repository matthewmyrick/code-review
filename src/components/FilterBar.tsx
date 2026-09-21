// Fuzzy filter + structured filters for the open-PR list; Enter
// escalates to a server-side search across all open PRs of the repo.

import { Search, SlidersHorizontal, X } from "lucide-react";

import { useAppStore } from "../state/store";
import { Button } from "./ui";

export function FilterBar() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const clearFilters = useAppStore((s) => s.clearFilters);
  const searchPrs = useAppStore((s) => s.searchPrs);
  const searchResults = useAppStore((s) => s.searchResults);
  const clearSearch = useAppStore((s) => s.clearSearch);

  const structured = Boolean(filters.author || filters.label || filters.hide_drafts);
  const inputClass =
    "w-full rounded-md border border-edge bg-ground px-2 py-1 text-xs text-cream outline-none focus:border-sky";

  return (
    <div className="border-b border-edge px-3 py-2">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={filters.query}
          onChange={(e) => {
            setFilters({ query: e.target.value });
            if (!e.target.value.trim()) clearSearch();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void searchPrs();
          }}
          placeholder="filter loaded · ↵ search all"
          className={`${inputClass} pl-6 ${searchResults ? "pr-6" : ""}`}
        />
        {searchResults ? (
          <button
            type="button"
            title="exit search"
            onClick={clearSearch}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-cream"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      <details open={structured}>
        <summary className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-cream">
          <SlidersHorizontal size={10} /> filters{structured ? " · active" : ""}
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <input
            value={filters.author}
            onChange={(e) => {
              setFilters({ author: e.target.value });
            }}
            placeholder="author"
            className={inputClass}
          />
          <input
            value={filters.label}
            onChange={(e) => {
              setFilters({ label: e.target.value });
            }}
            placeholder="label"
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={filters.hide_drafts}
              onChange={(e) => {
                setFilters({ hide_drafts: e.target.checked });
              }}
            />
            hide drafts
          </label>
          <div className="flex gap-1.5">
            <Button onClick={resetFilters} title="back to your saved defaults">
              reset
            </Button>
            <Button onClick={clearFilters}>clear</Button>
          </div>
        </div>
      </details>
    </div>
  );
}
