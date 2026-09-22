// PR title bar: branches, checks, reviews/approvers, labels — everything
// pulled from GitHub, read-only.

import {
  Check,
  ExternalLink,
  FileText,
  GitMerge,
  Link,
  Loader,
  OctagonAlert,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import { shortSha } from "../lib/format";
import { ipc } from "../lib/ipc";
import { ConflictHelper } from "./ConflictHelper";
import { MergeControls } from "./MergeControls";
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

/// Approve on GitHub via a popover: optional multi-line markdown review
/// body (with AI polish), explicit confirm.
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

/// One line of truth about merge readiness: who approved, and exactly
/// what's blocking when GitHub says the PR can't merge yet.
function MergeStatus(props: {
  state: string | null;
  approvals: string[];
  changesRequested: string[];
  failing: string[];
}) {
  const { state } = props;
  const pill = (() => {
    switch (state ?? "") {
      case "clean":
      case "has_hooks":
        return { label: "ready to merge", tone: "moss" as const };
      case "unstable":
        return { label: "checks pending", tone: "amber" as const };
      case "behind":
        return { label: "behind base", tone: "amber" as const };
      case "dirty":
        return { label: "merge conflicts", tone: "ember" as const };
      case "blocked":
        return { label: "blocked", tone: "ember" as const };
      case "draft":
        return { label: "draft", tone: "muted" as const };
      default:
        return null;
    }
  })();

  const blockers: string[] = [];
  if (props.changesRequested.length > 0) {
    blockers.push(`changes requested by ${props.changesRequested.join(", ")}`);
  }
  if (props.failing.length > 0) {
    const names = props.failing.slice(0, 3).join(", ");
    const more = props.failing.length > 3 ? ` +${String(props.failing.length - 3)} more` : "";
    blockers.push(`failing checks: ${names}${more}`);
  }
  if (state === "dirty") blockers.push("merge conflicts with the base branch");
  if (state === "behind") blockers.push("branch is behind the base branch");
  if (state === "blocked" && blockers.length === 0) {
    blockers.push("required approvals or checks not yet satisfied");
  }

  if (!pill && props.approvals.length === 0 && blockers.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-edge/60 bg-panel-2/40 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge size={12} className="text-muted" />
        {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : null}
        <span className="text-muted">
          {props.approvals.length > 0
            ? `approved by ${props.approvals.join(", ")}`
            : "no approvals yet"}
        </span>
      </div>
      {blockers.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {blockers.map((reason) => (
            <div key={reason} className="flex items-center gap-1.5 text-ember">
              <OctagonAlert size={11} className="shrink-0" />
              {reason}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
