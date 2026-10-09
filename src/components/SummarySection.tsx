// The agent's PR-level write-up, shown above the diff next to the PR's
// own description. One per PR: a re-review hands the agent this text to
// revise, so it's the running account rather than a per-run log.

import { Bot, Trash2 } from "lucide-react";

import { relativeTime } from "../lib/format";
import { useAppStore } from "../state/store";
import { MarkdownBody } from "./Markdown";
import { Pill } from "./ui";

export function SummarySection() {
  const summary = useAppStore((s) => s.bundle?.summary ?? null);
  const deleteSummary = useAppStore((s) => s.deleteSummary);
  if (summary === null) return null;

  const headSha = useAppStore.getState().bundle?.detail.pull_request.head_sha;
  // Written against commits that have since been pushed over — say so
  // rather than quietly presenting it as current.
  const stale = headSha !== undefined && headSha !== summary.head_sha;

  return (
    <details open className="mt-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted hover:text-cream">
        <Bot size={10} /> agent summary
        <span className="text-muted/70">
          · {summary.agent_name} · {relativeTime(summary.updated_at)}
        </span>
        {stale ? <Pill tone="amber">new commits since</Pill> : null}
        <button
          type="button"
          title="delete this summary — the next review writes a fresh one"
          onClick={(e) => {
            e.preventDefault();
            void deleteSummary();
          }}
          className="ml-auto inline-flex size-5 items-center justify-center rounded text-muted transition-colors hover:bg-ember/15 hover:text-ember"
        >
          <Trash2 size={11} />
        </button>
      </summary>
      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-moss/30 bg-moss/5 p-3">
        <MarkdownBody text={summary.body} />
      </div>
    </details>
  );
}
