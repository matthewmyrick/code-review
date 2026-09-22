// The agent's concrete proposed fix, committable to the PR branch with
// one (confirmed) click — GitHub-suggestion style.

import { GitCommitHorizontal } from "lucide-react";
import { useState } from "react";

import type { LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Spinner } from "./ui";

export function SuggestionBlock({ comment }: { comment: LocalComment }) {
  const commitSuggestion = useAppStore((s) => s.commitSuggestion);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const lineLabel =
    comment.end_line !== null && comment.end_line > comment.line
      ? `${String(comment.line)}–${String(comment.end_line)}`
      : String(comment.line);
  // An empty suggestion means "delete these lines".
  const isDeletion = (comment.suggestion ?? "").trim() === "";

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-moss/40">
      <div className="flex items-center gap-2 border-b border-moss/30 bg-moss/10 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-moss">
        <GitCommitHorizontal size={11} />
        {isDeletion ? `delete lines ${lineLabel}` : `suggested change · lines ${lineLabel}`}
      </div>
      {isDeletion ? (
        <div className="bg-ember/5 p-2.5 font-mono text-[11px] italic leading-relaxed text-ember">
          these lines will be removed
        </div>
      ) : (
        <pre className="max-h-48 overflow-auto bg-ground/70 p-2.5 font-mono text-[11px] leading-relaxed text-cream">
          {comment.suggestion}
        </pre>
      )}
      {comment.status !== "resolved" ? (
        <div className="flex items-center gap-1.5 border-t border-moss/30 bg-moss/5 px-2.5 py-1.5">
          {working ? (
            <Spinner label="committing to the PR branch…" />
          ) : confirming ? (
            <>
              <Button
                kind="danger"
                title="this WILL push a commit to the PR branch"
                onClick={() => {
                  setWorking(true);
                  void commitSuggestion(comment.id).then(() => {
                    setWorking(false);
                    setConfirming(false);
                  });
                }}
              >
                <GitCommitHorizontal size={11} /> confirm commit
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                }}
              >
                cancel
              </Button>
            </>
          ) : (
            <Button
              kind="primary"
              onClick={() => {
                setConfirming(true);
              }}
              title="commit this exact change to the PR branch (asks to confirm)"
            >
              <GitCommitHorizontal size={11} /> commit suggestion
            </Button>
          )}
        </div>
      ) : (
        <div className="border-t border-moss/30 bg-moss/10 px-2.5 py-1.5 text-[10px] font-medium text-moss">
          committed to the PR branch
        </div>
      )}
    </div>
  );
}
