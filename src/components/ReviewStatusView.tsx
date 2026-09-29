// Full-page, account-wide "review requested" list — every PR across
// every tracked org where your review is wanted, kept fresh by a
// standing timer (state/repoActions.ts refreshReviewRequests) that also
// toasts new arrivals. Clicking a row opens it in the review page,
// switching the repo picker to match (same openPr() used everywhere
// else a PR row is clicked).

import { Inbox, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { sortPrs } from "../lib/sort";
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

export function ReviewStatusView() {
  const reviewRequests = useAppStore((s) => s.reviewRequests);
  const reviewRequestsSeeded = useAppStore((s) => s.reviewRequestsSeeded);
  const prSort = useAppStore((s) => s.prSort);
  const refreshReviewRequests = useAppStore((s) => s.refreshReviewRequests);
  const prs = sortPrs(reviewRequests, prSort);

  useEffect(() => {
    void refreshReviewRequests();
  }, [refreshReviewRequests]);

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
          <p className="text-xs text-muted">
            every PR across your tracked orgs where your review is requested
          </p>
        </div>
        <Button
          onClick={() => {
            void refreshReviewRequests();
          }}
        >
          <RefreshCw size={11} /> refresh
        </Button>
      </div>
      {!reviewRequestsSeeded ? (
        <div className="px-3 py-8">
          <Spinner label="searching github…" />
        </div>
      ) : prs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted">
          <Inbox size={28} strokeWidth={1.5} />
          nothing to review — all clear
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
