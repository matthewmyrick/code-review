// Left pane: repo picker + the open-PR list, plus recently merged PRs
// held in the 3-day archive. (The changed-files tree lives inside the
// PR view.)

import { Archive, Inbox, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";

import { relativeTime } from "../lib/format";
import { fuzzyScore } from "../lib/fuzzy";
import type { ArchivedPr, PrFilters, PullRequest } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, Skeleton, Spinner } from "./ui";

export function Sidebar() {
  const settings = useAppStore((s) => s.settings);
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectRepo = useAppStore((s) => s.selectRepo);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-edge p-3">
        <select
          className="h-9 w-full rounded-lg border border-edge bg-panel-2 px-2 text-sm text-cream transition-colors focus:border-sky"
          value={selectedRepo ?? ""}
          onChange={(e) => {
            void selectRepo(e.target.value);
          }}
        >
          <option value="" disabled>
            select a repository…
          </option>
          {(settings?.repos ?? []).map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </div>

      <FilterBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReviewRequestsSection />
        <PrList />
        <ArchivedList />
      </div>
    </div>
  );
}

/** Open PRs across all repos waiting on your review (account-wide). */
function ReviewRequestsSection() {
  const requests = useAppStore((s) => s.reviewRequests);
  const loadReviewRequests = useAppStore((s) => s.loadReviewRequests);
  const openPr = useAppStore((s) => s.openPr);
  if (requests.length === 0) return null;

  return (
    <details open className="border-b border-edge/60 px-2 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 px-1 py-1 text-[11px] uppercase tracking-wide text-amber hover:text-cream">
        <Inbox size={11} /> review requested ({requests.length})
        <button
          type="button"
          title="refresh review requests"
          onClick={(e) => {
            e.preventDefault();
            void loadReviewRequests();
          }}
          className="ml-auto inline-flex size-5 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-cream"
        >
          <RefreshCw size={10} />
        </button>
      </summary>
      <div className="mt-1 space-y-1">
        {requests.map((pr) => (
          <button
            key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`}
            type="button"
            onClick={() => {
              void openPr(`${pr.repo.owner}/${pr.repo.name}`, pr.number);
            }}
            className="block w-full rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-edge hover:bg-panel-2/60"
          >
            <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted">
              <span className="truncate font-mono">
                {pr.repo.owner}/{pr.repo.name}
              </span>
              <span className="ml-auto">{relativeTime(pr.updated_at)}</span>
            </div>
            <div className="line-clamp-1 text-[12px] text-cream">
              <span className="font-medium text-amber">#{pr.number}</span> {pr.title}
            </div>
          </button>
        ))}
      </div>
    </details>
  );
}

/** Days until the archive purge deadline (ceil, min 0). */
function daysLeft(purgeAfter: string): number {
  const ms = new Date(purgeAfter).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function ArchivedList() {
  const archived = useAppStore((s) => s.archivedPrs);
  const selectPr = useAppStore((s) => s.selectPr);
  if (archived.length === 0) return null;
  return (
    <details className="border-t border-edge/60 px-2 py-2" open>
      <summary className="flex cursor-pointer items-center gap-1.5 px-1 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-cream">
        <Archive size={11} /> archived ({archived.length})
      </summary>
      <div className="mt-1 space-y-1">
        {archived.map((a) => (
          <ArchivedItem key={a.pull_request.number} archived={a} onOpen={selectPr} />
        ))}
      </div>
    </details>
  );
}

function ArchivedItem(props: { archived: ArchivedPr; onOpen: (n: number) => Promise<void> }) {
  const pr = props.archived.pull_request;
  const days = daysLeft(props.archived.purge_after);
  return (
    <button
      type="button"
      onClick={() => {
        void props.onOpen(pr.number);
      }}
      className="block w-full rounded-lg border border-transparent px-3 py-2 text-left opacity-80 transition-all hover:border-edge hover:bg-panel-2/60 hover:opacity-100"
    >
      <div className="mb-0.5 flex items-center gap-2">
        <span className="text-xs font-medium text-fur">#{pr.number}</span>
        <Pill tone="muted">merged</Pill>
        <span className="ml-auto text-[10px] text-muted">
          {days === 0 ? "purges today" : `purges in ${String(days)}d`}
        </span>
      </div>
      <div className="line-clamp-1 text-[12px] text-cream/80">{pr.title}</div>
    </button>
  );
}

/** Client-side filter pass with fuzzy text matching (fzf-style). In
 * server-search mode the text query was already applied by GitHub, so
 * only the structured filters run. Returns a rank (higher = better) or
 * null when the PR is filtered out. */
function filterRank(pr: PullRequest, f: PrFilters, applyQuery: boolean): number | null {
  if (f.hide_drafts && pr.draft) return null;
  if (f.author && fuzzyScore(f.author, pr.author.login) === null) return null;
  if (f.label && !pr.labels.some((l) => fuzzyScore(f.label, l) !== null)) return null;
  if (applyQuery && f.query.trim()) {
    const hay =
      `#${String(pr.number)} ${pr.title} ${pr.author.login} ${pr.head_ref} ` + pr.labels.join(" ");
    return fuzzyScore(f.query, hay);
  }
  return 0;
}

function FilterBar() {
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

function PrList() {
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const prs = useAppStore((s) => s.prs);
  const syncing = useAppStore((s) => s.syncing);
  const prHasMore = useAppStore((s) => s.prHasMore);
  const loadMorePrs = useAppStore((s) => s.loadMorePrs);
  const filters = useAppStore((s) => s.filters);
  const searchResults = useAppStore((s) => s.searchResults);
  const repoSyncing = selectedRepo ? (syncing[`prs:${selectedRepo}`] ?? false) : false;

  const searching = searchResults !== null;
  const visible = (searchResults ?? prs)
    .map((pr) => ({ pr, rank: filterRank(pr, filters, !searching) }))
    .filter((x): x is { pr: PullRequest; rank: number } => x.rank !== null)
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.pr);

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted">
        <span>{searching ? "search results (all open PRs)" : "Open pull requests"}</span>
        {repoSyncing ? <Spinner /> : <span>{visible.length}</span>}
      </div>
      <div className="space-y-1 px-2 pb-2">
        {visible.map((pr) => (
          <PrListItem key={pr.number} pr={pr} />
        ))}
        {visible.length === 0 && repoSyncing ? <PrListSkeleton /> : null}
        {visible.length === 0 && !repoSyncing ? (
          <div className="px-3 py-6 text-center text-xs text-muted">
            {!selectedRepo
              ? "pick a repository above"
              : searching
                ? "nothing matches across all open PRs"
                : prs.length > 0
                  ? "no loaded PRs match your filters"
                  : "no open PRs"}
          </div>
        ) : null}
        {prHasMore && !searching ? (
          <div className="flex justify-center py-2">
            <Button
              onClick={() => {
                void loadMorePrs();
              }}
              disabled={repoSyncing}
            >
              load more
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function PrListSkeleton() {
  return (
    <div className="space-y-2 p-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border border-edge/40 p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function PrListItem({ pr }: { pr: PullRequest }) {
  const selectedPr = useAppStore((s) => s.selectedPr);
  const selectPr = useAppStore((s) => s.selectPr);
  const active = selectedPr === pr.number;
  const hasStats = pr.additions > 0 || pr.deletions > 0 || pr.changed_files > 0;

  return (
    <button
      type="button"
      onClick={() => {
        void selectPr(pr.number);
      }}
      className={`animate-fade-up block w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
        active
          ? "border-sky/40 bg-panel-2 shadow-sm"
          : "border-transparent hover:border-edge hover:bg-panel-2/60"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-sky">#{pr.number}</span>
        {pr.draft ? <Pill tone="muted">draft</Pill> : null}
        <span className="ml-auto text-[11px] text-muted">{relativeTime(pr.updated_at)}</span>
      </div>
      <div className="line-clamp-2 text-[13px] leading-snug text-cream">{pr.title}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
        <span className="truncate">{pr.author.login}</span>
        {hasStats ? (
          <>
            <span className="text-moss">+{pr.additions}</span>
            <span className="text-ember">−{pr.deletions}</span>
          </>
        ) : null}
      </div>
    </button>
  );
}
