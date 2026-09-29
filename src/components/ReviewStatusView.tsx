// Full-page, account-wide review status: every PR across every tracked
// org where your review is requested, or that you authored — unlike
// the sidebar's inbox tabs, never scoped to whatever repo happens to
// be selected. The "requested" tab is kept fresh by a standing timer
// (state/repoActions.ts refreshReviewRequests) that also toasts new
// arrivals; "mine" loads lazily on first visit. Clicking a row opens it
// in the review page, switching the repo picker to match (same
// openPr() used everywhere else a PR row is clicked).

import { Inbox, RefreshCw, User } from "lucide-react";
import { useEffect, useState } from "react";

import { ipc } from "../lib/ipc";
import { sortPrs } from "../lib/sort";
import type { PullRequest } from "../lib/types";
import { useKeyNav } from "../state/keyNav";
import { useAppStore } from "../state/store";
import { InboxRow, rowKey } from "./InboxList";
import { Button, IconButton, Spinner } from "./ui";

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

  useEffect(() => {
    useKeyNav
      .getState()
      .setList(prs.map((pr) => ({ slug: `${pr.repo.owner}/${pr.repo.name}`, number: pr.number })));
  }, [prs]);

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
      ) : (
        <div className="space-y-1.5">
          {prs.map((pr) => (
            <InboxRow key={rowKey(pr)} pr={pr} />
          ))}
        </div>
      )}
    </div>
  );
}
