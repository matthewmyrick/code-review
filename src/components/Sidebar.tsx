// Left pane: repo picker + the open-PR list. (The changed-files tree
// lives inside the PR view.)

import { relativeTime } from "../lib/format";
import type { PullRequest } from "../lib/types";
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PrList />
      </div>
    </div>
  );
}

function PrList() {
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const prs = useAppStore((s) => s.prs);
  const syncing = useAppStore((s) => s.syncing);
  const prHasMore = useAppStore((s) => s.prHasMore);
  const loadMorePrs = useAppStore((s) => s.loadMorePrs);
  const repoSyncing = selectedRepo ? (syncing[`prs:${selectedRepo}`] ?? false) : false;

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted">
        <span>Open pull requests</span>
        {repoSyncing ? <Spinner /> : <span>{prs.length}</span>}
      </div>
      <div className="space-y-1 px-2 pb-2">
        {prs.map((pr) => (
          <PrListItem key={pr.number} pr={pr} />
        ))}
        {prs.length === 0 && repoSyncing ? <PrListSkeleton /> : null}
        {prs.length === 0 && !repoSyncing ? (
          <div className="px-3 py-6 text-center text-xs text-muted">
            {selectedRepo ? "no open PRs" : "pick a repository above"}
          </div>
        ) : null}
        {prHasMore ? (
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
