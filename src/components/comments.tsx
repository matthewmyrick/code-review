// Local review comments: the card (with triage actions) and the inline
// composer. These are Appa-local — nothing here touches GitHub.

import { useState } from "react";

import { relativeTime } from "../lib/format";
import type { CommentSeverity, DiffSide, LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, severityTone } from "./ui";

export function CommentCard({ comment }: { comment: LocalComment }) {
  const setCommentStatus = useAppStore((s) => s.setCommentStatus);
  const deleteComment = useAppStore((s) => s.deleteComment);

  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium text-cream">
          {comment.author_kind === "agent" ? "🤖 " : ""}
          {comment.author_name}
        </span>
        <Pill tone={severityTone(comment.severity)}>{comment.severity}</Pill>
        {comment.status !== "open" ? <Pill tone="muted">{comment.status}</Pill> : null}
        <span className="ml-auto text-[11px] text-muted">{relativeTime(comment.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed text-cream/90">{comment.body}</div>
      <div className="mt-1.5 flex gap-1.5">
        {comment.status === "open" ? (
          <>
            <Button
              kind="primary"
              onClick={() => {
                void setCommentStatus(comment.id, "accepted");
              }}
            >
              accept
            </Button>
            <Button
              onClick={() => {
                void setCommentStatus(comment.id, "rejected");
              }}
            >
              reject
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              void setCommentStatus(comment.id, "open");
            }}
          >
            reopen
          </Button>
        )}
        <Button
          kind="danger"
          onClick={() => {
            void deleteComment(comment.id);
          }}
        >
          delete
        </Button>
      </div>
    </div>
  );
}

export function InlineCommentForm(props: {
  path: string;
  line: number;
  side: DiffSide;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<CommentSeverity>("suggestion");
  const bundle = useAppStore((s) => s.bundle);
  const addComment = useAppStore((s) => s.addComment);

  if (!bundle) return null;
  const pr = bundle.detail.pull_request;

  const submit = () => {
    if (!body.trim()) return;
    void addComment({
      repo: pr.repo,
      pr_number: pr.number,
      head_sha: pr.head_sha,
      path: props.path,
      side: props.side,
      line: props.line,
      body: body.trim(),
      author_kind: "human",
      author_name: "you",
      severity,
      run_id: null,
    }).then(props.onDone);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") props.onDone();
        }}
        placeholder={`comment on ${props.path}:${String(props.line)} (⌘↵ to save)`}
        className="min-h-16 w-full resize-y rounded-md border border-edge bg-ground p-2 font-mono text-xs text-cream outline-none focus:border-sky"
      />
      <div className="flex items-center gap-2">
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as CommentSeverity);
          }}
          className="rounded-md border border-edge bg-panel-2 px-2 py-1 text-xs text-cream"
        >
          <option value="info">info</option>
          <option value="suggestion">suggestion</option>
          <option value="issue">issue</option>
          <option value="blocker">blocker</option>
        </select>
        <Button kind="primary" onClick={submit} disabled={!body.trim()}>
          add comment
        </Button>
        <Button onClick={props.onDone}>cancel</Button>
      </div>
    </div>
  );
}

export function CommentsPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const comments = bundle?.comments ?? [];

  if (comments.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted">
        no local comments yet — click a line number in the diff, or run an agent review
      </div>
    );
  }

  const open = comments.filter((c) => c.status === "open");
  const triaged = comments.filter((c) => c.status !== "open");

  return (
    <div className="flex flex-col gap-2 p-3">
      {open.length > 0 ? (
        <div className="text-[11px] uppercase tracking-wide text-muted">open ({open.length})</div>
      ) : null}
      {open.map((c) => (
        <PanelComment key={c.id} comment={c} />
      ))}
      {triaged.length > 0 ? (
        <div className="mt-2 text-[11px] uppercase tracking-wide text-muted">
          triaged ({triaged.length})
        </div>
      ) : null}
      {triaged.map((c) => (
        <PanelComment key={c.id} comment={c} />
      ))}
    </div>
  );
}

function PanelComment({ comment }: { comment: LocalComment }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-2.5">
      <div className="mb-1 truncate font-mono text-[11px] text-sky">
        {comment.path}:{comment.line}
      </div>
      <CommentCard comment={comment} />
    </div>
  );
}
