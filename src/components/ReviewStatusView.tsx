// Full-page, account-wide review status: every PR across every tracked
// org where your review is requested, or that you authored — unlike
// the sidebar's inbox tabs, never scoped to whatever repo happens to
// be selected. The "requested" tab is kept fresh by a standing timer
// (state/repoActions.ts refreshReviewRequests) that also toasts new
// arrivals; "mine" loads lazily on first visit. Clicking a row opens it
// in the review page, switching the repo picker to match (same
// openPr() used everywhere else a PR row is clicked).

import { Inbox, Loader2, Play, RefreshCw, User } from "lucide-react";
import { useEffect, useState } from "react";

import { ipc } from "../lib/ipc";
import { sortPrs } from "../lib/sort";
import type { PullRequest } from "../lib/types";
import { useKeyNav } from "../state/keyNav";
import { loadAgent, saveAgent } from "../state/persist";
import { isWorking, useRunBoard } from "../state/runBoard";
import { useAppStore } from "../state/store";
import { InboxRow, ReadyGroupedRows, rowKey } from "./InboxList";
import { Button, IconButton, Spinner } from "./ui";

/** Per-row "start review" control: pick an agent and kick off a review
 * right from this list, without opening the PR first. Shares the same
 * last-picked-agent memory as the review page's own agent picker. */
function QuickReviewControl({ pr }: { pr: PullRequest }) {
  const specs = useAppStore((s) => s.agentSpecs);
  const quickStartReview = useAppStore((s) => s.quickStartReview);
  const openPr = useAppStore((s) => s.openPr);
  const [agentName, setAgentName] = useState(loadAgent);
  const [starting, setStarting] = useState(false);
  const selected = agentName || (specs[0]?.name ?? "");
  const slug = `${pr.repo.owner}/${pr.repo.name}`;
  // Any in-flight run on this PR, wherever it was started from — the
  // run board is account-wide and updated live by tandem://run-updated.
  const activeRun = useRunBoard((s) =>
    Object.values(s.runs).find(
      (r) => r.repo_slug === slug && r.pr_number === pr.number && isWorking(r),
    ),
  );

  // Checked before the no-agents bail-out: a run can still be in flight
  // for this PR even if every agent spec was deleted since.
  if (activeRun ?? starting) {
    const label = (activeRun?.purpose ?? "pr review") === "pr review" ? "reviewing" : "working";
    return (
      <button
        type="button"
        onClick={() => {
          void openPr(slug, pr.number);
        }}
        title={`${activeRun?.agent_name ?? selected} is ${label} — open the PR to watch`}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-sky/40 bg-sky/10 px-2 text-[11px] text-sky transition-colors hover:bg-sky/20"
      >
        <Loader2 size={11} className="animate-spin" />
        {label}…
      </button>
    );
  }

  if (specs.length === 0) return null;

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-edge bg-panel-2 transition-colors focus-within:border-sky hover:border-edge">
      <select
        value={selected}
        onChange={(e) => {
          setAgentName(e.target.value);
          saveAgent(e.target.value);
        }}
        title="agent for this review"
        className="h-7 max-w-28 cursor-pointer border-0 bg-transparent pl-2 pr-1 text-[11px] text-muted outline-none transition-colors hover:text-cream"
      >
        {specs.map((spec) => (
          <option key={spec.name} value={spec.name}>
            {spec.name}
          </option>
        ))}
      </select>
      <span className="w-px bg-edge" />
      <button
        type="button"
        disabled={!selected}
        title={`start a ${selected} review of #${String(pr.number)}`}
        onClick={() => {
          setStarting(true);
          void quickStartReview(slug, pr.number, selected).finally(() => {
            setStarting(false);
          });
        }}
        className="inline-flex h-7 w-7 items-center justify-center text-sky transition-all hover:bg-sky/15 active:scale-95 disabled:opacity-40"
      >
        <Play size={12} />
      </button>
    </div>
  );
}

/** Header nav button: jumps to the review-status page, badged with how
 * many reviews are pending across every tracked org. */
export function ReviewStatusMenuButton() {
  const count = useAppStore((s) => s.reviewRequests.length);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <IconButton
      onClick={() => {
        setView(view === "review-status" ? "review" : "review-status");
      }}
      title="review status — PRs across your orgs needing your review"
      active={view === "review-status"}
    >
      <span className="relative">
        <Inbox size={15} />
        {count > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-amber text-[8px] font-bold text-ground">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </span>
    </IconButton>
  );
}

const TABS = [
  { id: "requested", label: "req", icon: Inbox },
  { id: "authored", label: "mine", icon: User },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function ReviewStatusView() {
  const [tab, setTab] = useState<Tab>("requested");
  const reviewRequests = useAppStore((s) => s.reviewRequests);
  const reviewRequestsSeeded = useAppStore((s) => s.reviewRequestsSeeded);
  const prSort = useAppStore((s) => s.prSort);
  const refreshReviewRequests = useAppStore((s) => s.refreshReviewRequests);
  const [authored, setAuthored] = useState<PullRequest[] | undefined>(undefined);

  useEffect(() => {
    void refreshReviewRequests();
  }, [refreshReviewRequests]);

  const loadAuthored = () => {
    setAuthored(undefined);
    ipc
      .listMyPrs("authored", null)
      .then(setAuthored)
      .catch(() => {
        setAuthored([]);
      });
  };
  useEffect(() => {
    if (tab === "authored" && authored === undefined) loadAuthored();
  }, [tab, authored]);

  const prs = sortPrs(tab === "requested" ? reviewRequests : (authored ?? []), prSort);
  const loading = tab === "requested" ? !reviewRequestsSeeded : authored === undefined;

  // On "mine", ReadyGroupedRows below owns the keyNav list itself (it
  // reorders into ready/open/draft groups); only publish the flat
  // fetch order here for "req".
  useEffect(() => {
    if (tab !== "requested") return;
    useKeyNav
      .getState()
      .setList(prs.map((pr) => ({ slug: `${pr.repo.owner}/${pr.repo.name}`, number: pr.number })));
  }, [tab, prs]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-cream">Review status</h1>
          <p className="text-xs text-muted">every PR across your tracked orgs, account-wide</p>
        </div>
        <Button
          onClick={() => {
            if (tab === "requested") void refreshReviewRequests();
            else loadAuthored();
          }}
        >
          <RefreshCw size={11} /> refresh
        </Button>
      </div>

      <div className="flex border-b border-edge">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              tab === id ? "border-b-2 border-sky text-cream" : "text-muted hover:text-cream"
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="px-3 py-8">
          <Spinner label="searching github…" />
        </div>
      ) : prs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted">
          <Inbox size={28} strokeWidth={1.5} />
          {tab === "requested" ? "nothing to review — all clear" : "nothing open"}
        </div>
      ) : tab === "authored" ? (
        <ReadyGroupedRows prs={prs} renderAside={(pr) => <QuickReviewControl pr={pr} />} />
      ) : (
        <div className="space-y-1.5">
          {prs.map((pr) => (
            <InboxRow key={rowKey(pr)} pr={pr} aside={<QuickReviewControl pr={pr} />} />
          ))}
        </div>
      )}
    </div>
  );
}
