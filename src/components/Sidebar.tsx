// Left pane: tabbed PR lists — the selected repo's open PRs (with
// filters + 3-day merge archive) and account-wide inbox tabs for
// requested reviews, mentions, and everything you're involved in.

import { ArrowUpDown, AtSign, GitPullRequest, Inbox, RefreshCw, User, Users } from "lucide-react";
import { useState } from "react";

import { relativeTime } from "../lib/format";
import { fuzzyScore } from "../lib/fuzzy";
import { isReadyToMerge } from "../lib/ready";
import { PR_SORTS, sortPrs } from "../lib/sort";
import type { InboxScope, PrFilters, PullRequest } from "../lib/types";
import { useAppStore } from "../state/store";
import { ArchivedList } from "./ArchivedList";
import { FilterBar } from "./FilterBar";
import { InboxList } from "./InboxList";
import { Button, Pill, Skeleton, Spinner } from "./ui";

type SidebarTab = "open" | InboxScope;

const TAB_KEY = "tandem-sidebar-tab";

const TABS: { id: SidebarTab; label: string; icon: typeof Inbox }[] = [
  { id: "open", label: "open", icon: GitPullRequest },
  { id: "requested", label: "req", icon: Inbox },
  { id: "mentions", label: "@me", icon: AtSign },
  { id: "authored", label: "mine", icon: User },
  { id: "involved", label: "inv", icon: Users },
];

export function Sidebar() {
  const settings = useAppStore((s) => s.settings);
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const requestedCount = useAppStore((s) => s.inbox.requested?.length ?? 0);
  const [tab, setTab] = useState<SidebarTab>(() => {
    const saved = localStorage.getItem(TAB_KEY);
    return saved === "requested" || saved === "mentions" || saved === "involved" ? saved : "open";
  });
  const pick = (t: SidebarTab) => {
    setTab(t);
    localStorage.setItem(TAB_KEY, t);
  };

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
          <option value="*">all repositories</option>
          {(settings?.repos ?? []).map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </div>

      <div className="flex border-b border-edge">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              pick(id);
            }}
            title={
              id === "open"
                ? "open PRs in the selected scope"
                : id === "authored"
                  ? "PRs you opened"
                  : id === "involved"
                    ? "involved: requested, mentioned, authored or commented"
                    : `scope: ${id}`
            }
            className={`flex flex-1 items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
              tab === id ? "border-b-2 border-sky text-cream" : "text-muted hover:text-cream"
            }`}
          >
            <Icon size={11} />
            {label}
            {id === "requested" && requestedCount > 0 ? (
              <span className="rounded-full bg-amber/20 px-1 text-[9px] font-semibold text-amber">
                {requestedCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-b border-edge/60 px-3 py-1.5">
        <ArrowUpDown size={11} className="shrink-0 text-muted" />
        <SortSelect />
        <RefreshButton tab={tab} />
      </div>

      {tab === "open" ? (
        <>
          <FilterBar />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PrList />
            <ArchivedList />
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InboxList scope={tab} />
        </div>
      )}
    </div>
  );
}

function RefreshButton({ tab }: { tab: SidebarTab }) {
  const refreshPrs = useAppStore((s) => s.refreshPrs);
  const loadInbox = useAppStore((s) => s.loadInbox);
  return (
    <button
      type="button"
      title="refresh this list"
      onClick={() => {
        if (tab === "open") void refreshPrs();
        else void loadInbox(tab, true);
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-cream"
    >
      <RefreshCw size={11} />
    </button>
  );
}

function SortSelect() {
  const prSort = useAppStore((s) => s.prSort);
  const setPrSort = useAppStore((s) => s.setPrSort);
  return (
    <select
      value={prSort}
      onChange={(e) => {
        setPrSort(e.target.value as typeof prSort);
      }}
      title="ordering for all PR lists"
      className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-[11px] text-muted transition-colors hover:text-cream focus:border-edge"
    >
      {PR_SORTS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
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

function PrList() {
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const prs = useAppStore((s) => s.prs);
  const syncing = useAppStore((s) => s.syncing);
  const prHasMore = useAppStore((s) => s.prHasMore);
  const loadMorePrs = useAppStore((s) => s.loadMorePrs);
  const filters = useAppStore((s) => s.filters);
  const searchResults = useAppStore((s) => s.searchResults);
  const repoSyncing = selectedRepo ? (syncing[`prs:${selectedRepo}`] ?? false) : false;

  const prSort = useAppStore((s) => s.prSort);
  const searching = searchResults !== null;
  const matched = (searchResults ?? prs)
    .map((pr) => ({ pr, rank: filterRank(pr, filters, !searching) }))
    .filter((x): x is { pr: PullRequest; rank: number } => x.rank !== null);
  // With an active fuzzy query, relevance wins; otherwise the chosen sort.
  const visible =
    !searching && filters.query.trim()
      ? matched.sort((a, b) => b.rank - a.rank).map((x) => x.pr)
      : sortPrs(
          matched.map((x) => x.pr),
          prSort,
        );

  const ready = visible.filter(isReadyToMerge);
  const rest = visible.filter((pr) => !isReadyToMerge(pr));

  return (
    <>
      {ready.length > 0 ? (
        <>
          <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-wide text-moss">
            ready to merge ({ready.length})
          </div>
          <div className="space-y-1 px-2">
            {ready.map((pr) => (
              <PrListItem key={pr.number} pr={pr} />
            ))}
          </div>
        </>
      ) : null}
      <div
        className={`flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted ${
          ready.length > 0 ? "mt-2 border-t border-edge/70 pt-3" : ""
        }`}
      >
        <span>{searching ? "search results (all open PRs)" : "Open pull requests"}</span>
        {repoSyncing ? <Spinner /> : <span>{rest.length}</span>}
      </div>
      <div className="space-y-1 px-2 pb-2">
        {rest.map((pr) => (
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
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const openPr = useAppStore((s) => s.openPr);
  const slug = `${pr.repo.owner}/${pr.repo.name}`;
  const allMode = selectedRepo === "*";
  const active = !allMode && selectedPr === pr.number;
  const hasStats = pr.additions > 0 || pr.deletions > 0 || pr.changed_files > 0;

  return (
    <button
      type="button"
      onClick={() => {
        void openPr(slug, pr.number);
      }}
      className={`animate-fade-up block w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
        isReadyToMerge(pr) ? "border-l-4 border-l-moss " : ""
      }${
        active
          ? "border-sky/40 bg-panel-2 shadow-sm"
          : "border-transparent hover:border-edge hover:bg-panel-2/60"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-sky">#{pr.number}</span>
        {allMode ? <span className="truncate font-mono text-[10px] text-muted">{slug}</span> : null}
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
