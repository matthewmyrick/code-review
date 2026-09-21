// The "approved and green" signal. mergeable_state alone is useless on
// merge-queue repos (always "blocked"), so readiness prefers GitHub's
// reviewDecision + status-check rollup when present.

import type { PullRequest } from "./types";

export function isReadyToMerge(pr: PullRequest): boolean {
  if (pr.draft) return false;
  if (pr.mergeable_state === "dirty") return false;
  if (pr.review_decision !== null || pr.checks_state !== null) {
    const approved = (pr.review_decision ?? "APPROVED") === "APPROVED";
    const green = pr.checks_state === "SUCCESS";
    return approved && green;
  }
  return pr.mergeable_state === "clean";
}
