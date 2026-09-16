// PR title bar: branches, checks, reviews/approvers, labels — everything
// pulled from GitHub, read-only.

import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { useState } from "react";

import { shortSha } from "../lib/format";
import { openExternal, prUrl } from "../lib/open";
import type { PrDetail } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, checkTone, Pill, Spinner } from "./ui";

export function PrHeader({ detail }: { detail: PrDetail }) {
  const pr = detail.pull_request;
  const refreshBundle = useAppStore((s) => s.refreshBundle);
  const syncing = useAppStore((s) => s.syncing);
  const busy = syncing[`pr:${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`] ?? false;

  const approvals = detail.reviews.filter((r) => r.verdict === "approved");
  const changesRequested = detail.reviews.filter((r) => r.verdict === "changes_requested");
  const failing = detail.checks.filter((c) => c.state === "failure");
  const pending = detail.checks.filter((c) => c.state === "pending");

  return (
    <header className="border-b border-edge bg-panel px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold text-cream">
            {pr.title} <span className="font-normal text-muted">#{pr.number}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{pr.author.login}</span>
            <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">
              {pr.head_ref} → {pr.base_ref}
            </span>
            <span className="font-mono text-[11px]">{shortSha(pr.head_sha)}</span>
            <span className="text-moss">+{pr.additions}</span>
            <span className="text-ember">−{pr.deletions}</span>
            <span>{pr.changed_files} files</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy ? <Spinner label="syncing" /> : null}
          <Button
            onClick={() => {
              openExternal(prUrl(pr.repo, pr.number));
            }}
            title="open this PR on github.com"
          >
            <ExternalLink size={12} /> github
          </Button>
          <ApproveButton />
          <Button
            onClick={() => {
              void refreshBundle();
            }}
            title="Re-fetch from GitHub"
          >
            <RefreshCw size={12} /> refresh
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {failing.length > 0 ? <Pill tone="ember">{failing.length} checks failing</Pill> : null}
        {pending.length > 0 ? <Pill tone="amber">{pending.length} checks running</Pill> : null}
        {failing.length === 0 && pending.length === 0 && detail.checks.length > 0 ? (
          <Pill tone="moss">checks green</Pill>
        ) : null}
        {approvals.map((r) => (
          <Pill key={r.author.login} tone="moss">
            <Check size={11} /> {r.author.login}
          </Pill>
        ))}
        {changesRequested.map((r) => (
          <Pill key={r.author.login} tone="ember">
            <X size={11} /> {r.author.login}
          </Pill>
        ))}
        {pr.labels.map((label) => (
          <Pill key={label} tone="sky">
            {label}
          </Pill>
        ))}
      </div>

      {detail.checks.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted hover:text-cream">
            all checks ({detail.checks.length})
          </summary>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {detail.checks.map((check) => (
              <Pill key={check.name} tone={checkTone(check.state)}>
                {check.name}
              </Pill>
            ))}
          </div>
        </details>
      ) : null}
    </header>
  );
}

/// Two-step "approve on GitHub" — an explicit user action.
function ApproveButton() {
  const approvePr = useAppStore((s) => s.approvePr);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  if (working) return <Spinner label="approving…" />;
  if (confirming) {
    return (
      <>
        <Button
          kind="danger"
          title="this WILL submit an approving review on GitHub"
          onClick={() => {
            setWorking(true);
            void approvePr(null).then(() => {
              setWorking(false);
              setConfirming(false);
            });
          }}
        >
          <Check size={12} /> confirm approve
        </Button>
        <Button
          onClick={() => {
            setConfirming(false);
          }}
        >
          cancel
        </Button>
      </>
    );
  }
  return (
    <Button
      kind="primary"
      title="approve this PR on GitHub (asks to confirm)"
      onClick={() => {
        setConfirming(true);
      }}
    >
      <Check size={12} /> approve
    </Button>
  );
}
