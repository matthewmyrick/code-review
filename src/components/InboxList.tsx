// Account-wide PR inbox tabs: PRs across all repos where your review is
// requested, you're mentioned, or you're otherwise involved. Loaded
// lazily per tab; clicking a row jumps to the PR (any repo).

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { relativeTime } from "../lib/format";
import type { InboxScope } from "../lib/types";
import { useAppStore } from "../state/store";
import { Spinner } from "./ui";

const SCOPE_HINT: Record<InboxScope, string> = {
  requested: "PRs waiting on your review",
  mentions: "PRs where you were mentioned",
  involved: "requested, mentioned, authored or commented — everything with your name on it",
};

export function InboxList({ scope }: { scope: InboxScope }) {
  const prs = useAppStore((s) => s.inbox[scope]);
  const loadInbox = useAppStore((s) => s.loadInbox);
  const openPr = useAppStore((s) => s.openPr);
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const selectedPr = useAppStore((s) => s.selectedPr);

  useEffect(() => {
    void loadInbox(scope);
  }, [scope, loadInbox]);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-muted">
        <span className="truncate" title={SCOPE_HINT[scope]}>
          {SCOPE_HINT[scope]}
        </span>
        <button
          type="button"
          title="refresh"
          onClick={() => {
            void loadInbox(scope, true);
          }}
          className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-cream"
        >
          <RefreshCw size={10} />
        </button>
      </div>

      <div className="space-y-1 px-2 pb-2">
        {prs === undefined ? (
          <div className="px-3 py-4">
            <Spinner label="searching github…" />
          </div>
        ) : prs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted">nothing here — all clear</div>
        ) : (
          prs.map((pr) => {
            const slug = `${pr.repo.owner}/${pr.repo.name}`;
            const active = selectedRepo === slug && selectedPr === pr.number;
            return (
              <button
                key={`${slug}#${String(pr.number)}`}
                type="button"
                onClick={() => {
                  void openPr(slug, pr.number);
                }}
                className={`animate-fade-up block w-full rounded-lg border px-3 py-2 text-left transition-all ${
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
          })
        )}
      </div>
    </div>
  );
}
