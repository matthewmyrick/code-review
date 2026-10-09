// PR title bar: state, branches, checks, reviews/approvers, labels.
// Read-only apart from the explicit GitHub actions it offers (approve,
// merge, ready-for-review).

import {
  Check,
  ExternalLink,
  FileText,
  GitPullRequestArrow,
  Link,
  Loader,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { shortSha } from "../lib/format";
import { ipc } from "../lib/ipc";
import { ConflictHelper } from "./ConflictHelper";
import { MergeControls } from "./MergeControls";
import { CommitsSection } from "./CommitsSection";
import { MergeStatus } from "./MergeStatus";
import { MergedBanner } from "./MergedBanner";
import { PrStateBadge } from "./PrStateBadge";
import { OpenInEditorButton } from "./OpenInEditor";
import { openExternal, prUrl } from "../lib/open";
import { pushInfo } from "../state/toasts";
import { MarkdownBody } from "./Markdown";
import type { PrDetail } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, checkTone, Pill, Spinner } from "./ui";

export function PrHeader({ detail }: { detail: PrDetail }) {
  const pr = detail.pull_request;
  const refreshBundle = useAppStore((s) => s.refreshBundle);
  const viewer = useAppStore((s) => s.viewer);
  const syncing = useAppStore((s) => s.syncing);
  const busy = syncing[`pr:${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`] ?? false;

  const approvals = detail.reviews.filter((r) => r.verdict === "approved");
  const changesRequested = detail.reviews.filter((r) => r.verdict === "changes_requested");
  const failing = detail.checks.filter((c) => c.state === "failure");
  const pending = detail.checks.filter((c) => c.state === "pending");
  // Clicking a checks pill is a question ("which ones?") — answer it by
  // opening the full list and scrolling it into view, failures first.
  const [checksOpen, setChecksOpen] = useState(false);
  const checksRef = useRef<HTMLDetailsElement>(null);
  const openChecks = () => {
    setChecksOpen(true);
    setTimeout(() => {
      checksRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  };
  const orderedChecks = [
    ...failing,
    ...pending,
    ...detail.checks.filter((c) => c.state !== "failure" && c.state !== "pending"),
  ];

  return (
    <header className="border-b border-edge bg-panel px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-[15px] font-semibold text-cream">
            <PrStateBadge pr={pr} always />
            <span className="truncate">{pr.title}</span>
            <span className="shrink-0 font-normal text-muted">#{pr.number}</span>
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {busy ? <Spinner label="syncing" /> : null}
          <Button
            onClick={() => {
              openExternal(prUrl(pr.repo, pr.number));
            }}
            title="open this PR on github.com"
          >
            <ExternalLink size={12} /> github
          </Button>
          <CopyUrlButton url={prUrl(pr.repo, pr.number)} />
          <OpenInEditorButton repo={`${pr.repo.owner}/${pr.repo.name}`} number={pr.number} />
          {pr.draft && viewer !== null && viewer === pr.author.login ? (
            <ReadyForReviewButton repo={`${pr.repo.owner}/${pr.repo.name}`} number={pr.number} />
          ) : null}
          <MergeControls pr={pr} />
          {viewer !== null && viewer === pr.author.login ? null : <ApproveButton />}
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
        {failing.length > 0 ? (
          <ChecksPill tone="ember" onClick={openChecks}>
            {failing.length} checks failing
          </ChecksPill>
        ) : null}
        {pending.length > 0 ? (
          <ChecksPill tone="amber" onClick={openChecks}>
            {pending.length} checks running
          </ChecksPill>
        ) : null}
        {failing.length === 0 && pending.length === 0 && detail.checks.length > 0 ? (
          <ChecksPill tone="moss" onClick={openChecks}>
            checks green
          </ChecksPill>
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
        {pr.requested_reviewers.map((login) => (
          <Pill key={`await-${login}`} tone="amber">
            awaiting {login}
          </Pill>
        ))}
        {pr.labels.map((label) => (
          <Pill key={label} tone="sky">
            {label}
          </Pill>
        ))}
      </div>

      <MergedBanner pr={pr} />

      <ConflictHelper pr={pr} />

      <MergeStatus
        state={pr.mergeable_state}
        approvals={approvals.map((r) => r.author.login)}
        changesRequested={changesRequested.map((r) => r.author.login)}
        failing={failing.map((c) => c.name)}
      />

      {pr.body.trim() ? (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-cream">
            <FileText size={10} /> description
          </summary>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-edge/60 bg-panel-2/40 p-3">
            <MarkdownBody text={pr.body} />
          </div>
        </details>
      ) : null}

      <CommitsSection repo={pr.repo} number={pr.number} />

      {detail.checks.length > 0 ? (
        <details
          ref={checksRef}
          open={checksOpen}
          onToggle={(e) => {
            setChecksOpen(e.currentTarget.open);
          }}
          className="mt-2"
        >
          <summary className="cursor-pointer text-[11px] text-muted hover:text-cream">
            all checks ({detail.checks.length})
          </summary>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {orderedChecks.map((check) => (
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

/** Take your own draft out of draft. Only rendered on a draft you
 * authored — GitHub rejects it from anyone else. */
function ReadyForReviewButton({ repo, number }: { repo: string; number: number }) {
  const refreshBundle = useAppStore((s) => s.refreshBundle);
  const [working, setWorking] = useState(false);
  if (working) return <Spinner label="opening for review…" />;
  return (
    <Button
      kind="primary"
      title="mark this PR ready for review on GitHub (takes it out of draft)"
      onClick={() => {
        setWorking(true);
        ipc
          .markReadyForReview(repo, number)
          .then(() => {
            pushInfo("marked ready for review");
            return refreshBundle();
          })
          .catch((e: unknown) => {
            console.error("ready for review failed", e);
            pushInfo("couldn't mark it ready — check GitHub");
          })
          .finally(() => {
            setWorking(false);
          });
      }}
    >
      <GitPullRequestArrow size={12} /> ready for review
    </Button>
  );
}

/** A checks pill that opens the full check list when clicked. */
function ChecksPill(props: {
  tone: "ember" | "amber" | "moss";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title="show every check"
      className="rounded-full transition-transform hover:brightness-125 active:scale-95"
    >
      <Pill tone={props.tone}>{props.children}</Pill>
    </button>
  );
}

/** Copy-URL with a transient success check in place of the link icon. */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={() => {
        navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            pushInfo("PR URL copied");
            setTimeout(() => {
              setCopied(false);
            }, 1500);
          })
          .catch(console.warn);
      }}
      title="copy the PR URL"
    >
      {copied ? <Check size={12} className="text-moss" /> : <Link size={12} />}
    </Button>
  );
}

/// Approve on GitHub via a popover: optional multi-line markdown review
/// body (with AI polish), explicit confirm.
function ApproveButton() {
  const approvePr = useAppStore((s) => s.approvePr);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [body, setBody] = useState("");

  const submit = () => {
    setWorking(true);
    void approvePr(body.trim() ? body.trim() : null).then(() => {
      setWorking(false);
      setOpen(false);
      setBody("");
    });
  };

  const polish = () => {
    if (!body.trim() || polishing) return;
    setPolishing(true);
    ipc
      .polishText(body)
      .then(setBody)
      .catch((e: unknown) => {
        console.error("polish failed", e);
      })
      .finally(() => {
        setPolishing(false);
      });
  };

  return (
    <span className="relative">
      <Button
        kind="primary"
        title="approve this PR on GitHub (opens a confirm panel)"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <Check size={12} /> approve
      </Button>

      {open ? (
        <div className="animate-fade-up absolute right-0 top-full z-40 mt-2 w-96 rounded-xl border border-edge bg-panel p-3 shadow-2xl">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            approve on github
          </div>
          <div className="relative">
            <textarea
              autoFocus
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={
                "optional review comment — markdown supported\n(posted as your review body, \u2318\u21B5 to approve)"
              }
              className="min-h-28 w-full resize-y rounded-md border border-edge bg-ground p-2 pr-8 text-xs leading-relaxed text-cream outline-none focus:border-sky"
            />
            <button
              type="button"
              onClick={polish}
              disabled={polishing || !body.trim()}
              title="polish — fix typos & grammar with AI"
              className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-amber disabled:pointer-events-none disabled:opacity-30"
            >
              {polishing ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {working ? (
              <Spinner label="approving…" />
            ) : (
              <>
                <Button
                  kind="danger"
                  title="this WILL submit an approving review on GitHub"
                  onClick={submit}
                >
                  <Check size={12} /> confirm approve
                </Button>
                <Button
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  cancel
                </Button>
              </>
            )}
            <span className="ml-auto text-[10px] text-muted">
              {body.trim() ? `${String(body.trim().length)} chars` : "no comment"}
            </span>
          </div>
        </div>
      ) : null}
    </span>
  );
}
