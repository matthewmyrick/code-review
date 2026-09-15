// Left rail: repo picker + open PR list (cache-first, so it renders
// instantly and refines when the sync lands).

import { relativeTime } from "../lib/format";
import type { PullRequest } from "../lib/types";
import { useAppStore } from "../state/store";
import { Pill, Spinner } from "./ui";

export function Sidebar() {
  const settings = useAppStore((s) => s.settings);
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const prs = useAppStore((s) => s.prs);
  const syncing = useAppStore((s) => s.syncing);

  const repoSyncing = selectedRepo ? (syncing[`prs:${selectedRepo}`] ?? false) : false;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-edge bg-panel">
      <div className="border-b border-edge p-3">
        <select
          className="w-full rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-sm text-cream"
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

      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted">
        <span>Open pull requests</span>
        {repoSyncing ? <Spinner /> : <span>{prs.length}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {prs.map((pr) => (
          <PrListItem key={pr.number} pr={pr} />
        ))}
        {prs.length === 0 && !repoSyncing ? (
          <div className="px-3 py-6 text-center text-xs text-muted">no open PRs</div>
        ) : null}
      </div>
    </aside>
  );
}

function PrListItem({ pr }: { pr: PullRequest }) {
  const selectedPr = useAppStore((s) => s.selectedPr);
  const selectPr = useAppStore((s) => s.selectPr);
  const active = selectedPr === pr.number;

  return (
    <button
      type="button"
      onClick={() => {
        void selectPr(pr.number);
      }}
      className={`block w-full border-b border-edge/50 px-3 py-2.5 text-left transition-colors ${
        active ? "bg-panel-2" : "hover:bg-panel-2/60"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-muted">#{pr.number}</span>
        {pr.draft ? <Pill tone="muted">draft</Pill> : null}
        <span className="ml-auto text-[11px] text-muted">{relativeTime(pr.updated_at)}</span>
      </div>
      <div className="line-clamp-2 text-[13px] leading-snug text-cream">{pr.title}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
        <span>{pr.author.login}</span>
        <span className="text-moss">+{pr.additions}</span>
        <span className="text-ember">−{pr.deletions}</span>
      </div>
    </button>
  );
}
