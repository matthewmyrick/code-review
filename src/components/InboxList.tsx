// Account-wide PR inbox tabs: PRs across all repos where your review is
// requested, you're mentioned, or you're otherwise involved. Loaded
// lazily per tab; clicking a row jumps to the PR (any repo).

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { relativeTime } from "../lib/format";
import { isReadyToMerge } from "../lib/ready";
import { sortPrs } from "../lib/sort";
import type { InboxScope, PullRequest } from "../lib/types";
import { useAppStore } from "../state/store";
import { Spinner } from "./ui";

export function InboxList({ scope }: { scope: InboxScope }) {
  const raw = useAppStore((s) => s.inbox[scope]);
  const prSort = useAppStore((s) => s.prSort);
  const loadInbox = useAppStore((s) => s.loadInbox);
  const prs = raw === undefined ? undefined : sortPrs(raw, prSort);

  useEffect(() => {
    void loadInbox(scope);
  }, [scope, loadInbox]);

  return (
    <div>
      <div className="space-y-1 px-2 py-2">
        {prs === undefined ? (
          <div className="px-3 py-4">
            <Spinner label="searching github…" />
          </div>
        ) : prs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted">nothing here — all clear</div>
        ) : (
          <ReadyGroupedRows prs={prs} />
        )}
      </div>
      {scope === "requested" ? <ApprovedFooter /> : null}
    </div>
  );
}

/** Ready-to-merge PRs first, a subtle divider, then everything else in
 * the chosen sort order. */
function ReadyGroupedRows({ prs }: { prs: PullRequest[] }) {
  const ready = prs.filter(isReadyToMerge);
  const rest = prs.filter((pr) => !isReadyToMerge(pr));
  return (
    <>
      {ready.map((pr) => (
        <InboxRow key={rowKey(pr)} pr={pr} />
      ))}
      {ready.length > 0 && rest.length > 0 ? (
        <div className="mx-3 my-2 border-t border-edge/70" />
      ) : null}
      {rest.map((pr) => (
        <InboxRow key={rowKey(pr)} pr={pr} />
      ))}
    </>
  );
}

function rowKey(pr: PullRequest): string {
  return `${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`;
}

function InboxRow({ pr }: { pr: PullRequest }) {
  const openPr = useAppStore((s) => s.openPr);
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const slug = `${pr.repo.owner}/${pr.repo.name}`;
  const active = selectedRepo === slug && selectedPr === pr.number;
  return (
    <button
      type="button"
      onClick={() => {
        void openPr(slug, pr.number);
      }}
      className={`animate-fade-up block w-full rounded-lg border px-3 py-2 text-left transition-all ${
        isReadyToMerge(pr) ? "border-l-4 border-l-moss " : ""
      }${
        active
          ? "border-sky/40 bg-panel-2 shadow-sm"
          : "border-transparent hover:border-edge hover:bg-panel-2/60"
      }`}
    >
      <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted">
        <span className="truncate font-mono">{slug}</span>
        <span className="ml-auto shrink-0">{relativeTime(pr.updated_at)}</span>
      </div>
      <div className="line-clamp-1 text-[12px] text-cream">
        <span className="font-medium text-amber">#{pr.number}</span> {pr.title}
      </div>
      <div className="mt-0.5 text-[10px] text-muted">{pr.author.login}</div>
    </button>
  );
}

/** Bottom of the requested tab: PRs you already approved that are
 * still open — handy for "did that ever merge?" follow-ups. */
function ApprovedFooter() {
  const raw = useAppStore((s) => s.inbox.approved);
  const prSort = useAppStore((s) => s.prSort);
  const loadInbox = useAppStore((s) => s.loadInbox);
  const prs = raw === undefined ? undefined : sortPrs(raw, prSort);

  useEffect(() => {
    void loadInbox("approved");
  }, [loadInbox]);

  return (
    <details open className="border-t border-edge/60 px-2 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 px-1 py-1 text-[11px] uppercase tracking-wide text-moss hover:text-cream">
        <CheckCircle2 size={11} /> approved by you · still open ({prs?.length ?? "…"})
        <button
          type="button"
          title="refresh"
          onClick={(e) => {
            e.preventDefault();
            void loadInbox("approved", true);
          }}
          className="ml-auto inline-flex size-5 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-cream"
        >
          <RefreshCw size={10} />
        </button>
      </summary>
      <div className="mt-1 space-y-1 px-0">
        {prs === undefined ? (
          <div className="px-3 py-3">
            <Spinner label="checking your approvals…" />
          </div>
        ) : prs.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-muted">none pending merge</div>
        ) : (
          prs.map((pr) => <InboxRow key={rowKey(pr)} pr={pr} />)
        )}
      </div>
    </details>
  );
}
