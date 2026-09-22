// Account-wide PR inbox tabs: PRs across all repos where your review is
// requested, you're mentioned, or you're otherwise involved. Loaded
// lazily per tab; clicking a row jumps to the PR (any repo).

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { relativeTime } from "../lib/format";
import { isReadyToMerge } from "../lib/ready";
import { EdgeStripes, useFailingChecksTip } from "./EdgeStripes";
import { sortPrs } from "../lib/sort";
import type { InboxScope, PullRequest } from "../lib/types";
import { useIsCursor, useKeyNav } from "../state/keyNav";
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

/** Three groups, each keeping the chosen sort order, separated by
 * subtle dividers: ready to merge, then open-not-approved, then
 * drafts last. */
function ReadyGroupedRows({ prs }: { prs: PullRequest[] }) {
  const groups = [
    prs.filter(isReadyToMerge),
    prs.filter((pr) => !isReadyToMerge(pr) && !pr.draft),
    prs.filter((pr) => !isReadyToMerge(pr) && pr.draft),
  ].filter((g) => g.length > 0);
  // Publish the on-screen order (groups flattened) for j/k navigation.
  const flat = groups.flat();
  useEffect(() => {
    useKeyNav
      .getState()
      .setList(flat.map((pr) => ({ slug: `${pr.repo.owner}/${pr.repo.name}`, number: pr.number })));
  }, [flat]);
  return (
    <>
      {groups.map((group, i) => (
        <div key={`group-${String(i)}-${group[0] ? rowKey(group[0]) : ""}`} className="space-y-1">
          {i > 0 ? <div className="mx-3 my-2 border-t border-edge/70" /> : null}
          {group.map((pr) => (
            <InboxRow key={rowKey(pr)} pr={pr} />
          ))}
        </div>
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
  const { onMouseEnter, onMouseLeave, tipEl } = useFailingChecksTip(pr);
  const isCursor = useIsCursor(slug, pr.number);
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isCursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        void openPr(slug, pr.number);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`animate-fade-up relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-all ${
        active
          ? "border-sky/40 bg-panel-2 shadow-sm"
          : isCursor
            ? "border-sky/60 bg-panel-2/60 ring-1 ring-sky/30"
            : "border-transparent hover:border-edge hover:bg-panel-2/60"
      }`}
    >
      <EdgeStripes pr={pr} />
      {tipEl}
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
