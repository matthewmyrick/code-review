// The home page: account-wide review status across every tracked org,
// never scoped to one repo. "req" is kept fresh by a standing timer
// (state/repoActions.ts refreshReviewRequests) that also toasts new
// arrivals; "mine" and "mentions" load lazily on first visit; "find"
// browses any repo's open PRs. Clicking a row opens it in the review
// view, switching the repo to match.

import { AtSign, Inbox, RefreshCw, Search, User } from "lucide-react";
import { useEffect, useState } from "react";

import { sortPrs } from "../lib/sort";
import type { InboxScope } from "../lib/types";
import type { ReviewTab } from "../state/keyNav";
import { useKeyNav } from "../state/keyNav";
import { useAppStore } from "../state/store";
import { FindPrTab } from "./FindPrTab";
import { ApprovedFooter, InboxRow, ReadyGroupedRows, rowKey } from "./PrRows";
import { QuickReviewControl } from "./QuickReviewControl";
import { Button, CountBadge, IconButton, Spinner } from "./ui";

/** Header nav button: jumps to the review-status page, badged with how
 * many reviews are pending across every tracked org. */
export function ReviewStatusMenuButton() {
  const count = useAppStore((s) => s.reviewRequests.length);
  const view = useAppStore((s) => s.view);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const setView = useAppStore((s) => s.setView);

  return (
    <IconButton
      onClick={() => {
        // Only toggles back to the review view when there's a PR open
        // to go back to — otherwise this is home and stays put.
        setView(view === "review-status" && selectedPr !== null ? "review" : "review-status");
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

const TABS: { id: ReviewTab; label: string; icon: typeof Inbox }[] = [
  { id: "requested", label: "req", icon: Inbox },
  { id: "authored", label: "mine", icon: User },
  { id: "mentions", label: "mentions", icon: AtSign },
  { id: "find", label: "find PR", icon: Search },
];

export function ReviewStatusView() {
  const tab = useKeyNav((s) => s.tab);
  const setTab = useKeyNav((s) => s.setTab);
  const reviewRequests = useAppStore((s) => s.reviewRequests);
  const reviewRequestsSeeded = useAppStore((s) => s.reviewRequestsSeeded);
  const prSort = useAppStore((s) => s.prSort);
  const refreshReviewRequests = useAppStore((s) => s.refreshReviewRequests);
  const loadInbox = useAppStore((s) => s.loadInbox);
  // "mine"/"mentions" live in the store's account-wide inbox map so the
  // `r` shortcut can refresh whichever one is on screen.
  const lazyScope: InboxScope | null = tab === "authored" || tab === "mentions" ? tab : null;
  const lazyList = useAppStore((s) => (lazyScope === null ? undefined : s.inbox[lazyScope]));

  useEffect(() => {
    void refreshReviewRequests();
  }, [refreshReviewRequests]);

  useEffect(() => {
    if (lazyScope !== null) void loadInbox(lazyScope);
  }, [lazyScope, loadInbox]);

  const [refreshing, setRefreshing] = useState(false);
  const counts = useAppStore((s) => s.inbox);
  const tabCount = (id: ReviewTab): number | undefined => {
    if (id === "requested") return reviewRequests.length;
    if (id === "authored" || id === "mentions") return counts[id]?.length;
    return undefined;
  };
  const prs = sortPrs(tab === "requested" ? reviewRequests : (lazyList ?? []), prSort);
  const loading =
    tab === "requested" ? !reviewRequestsSeeded : lazyScope !== null && lazyList === undefined;

  // "mine" reorders into ready/open/draft groups and publishes its own
  // keyNav list; "find" publishes its own too.
  useEffect(() => {
    if (tab !== "requested" && tab !== "mentions") return;
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
        {tab === "find" ? null : (
          <Button
            disabled={refreshing}
            onClick={() => {
              const done = () => {
                setRefreshing(false);
              };
              setRefreshing(true);
              if (tab === "requested") void refreshReviewRequests().finally(done);
              else if (lazyScope !== null) void loadInbox(lazyScope, true).finally(done);
              else done();
            }}
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> refresh
          </Button>
        )}
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
            <CountBadge count={tabCount(id)} />
          </button>
        ))}
      </div>

      {tab === "find" ? (
        <FindPrTab />
      ) : loading ? (
        <div className="px-3 py-8">
          <Spinner label="searching github…" />
        </div>
      ) : prs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted">
          <Inbox size={28} strokeWidth={1.5} />
          {tab === "requested" ? "nothing to review — all clear" : "nothing here"}
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

      {tab === "requested" && !loading ? <ApprovedFooter /> : null}
    </div>
  );
}
