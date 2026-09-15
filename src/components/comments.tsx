// Local review comments: threaded cards (with triage + reply-to-agent)
// and the inline composer. Local comments never touch GitHub; GitHub
// comments render read-only with their own badge.

import { Archive, Bot, Globe, Reply, RotateCcw, Trash2, User } from "lucide-react";
import { useState } from "react";

import { relativeTime } from "../lib/format";
import type { CommentSeverity, DiffSide, GithubComment, LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, severityTone, Spinner } from "./ui";

/** Group local comments into threads: roots with their replies. */
export function groupThreads(
  comments: LocalComment[],
): { root: LocalComment; replies: LocalComment[] }[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = comments.filter((c) => !c.parent_id || !byId.has(c.parent_id));
  return roots.map((root) => ({
    root,
    replies: comments
      .filter((c) => c.parent_id === root.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

export function CommentThread({ root, replies }: { root: LocalComment; replies: LocalComment[] }) {
  const [replying, setReplying] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <CommentCard
        comment={root}
        onReply={() => {
          setReplying(true);
        }}
      />
      {replies.length > 0 ? (
        <div className="ml-3 flex flex-col gap-2 border-l-2 border-edge/70 pl-3">
          {replies.map((reply) => (
            <CommentCard key={reply.id} comment={reply} isReply />
          ))}
        </div>
      ) : null}
      {replying ? (
        <div className="ml-3 border-l-2 border-sky/40 pl-3">
          <ReplyComposer
            root={root}
            onDone={() => {
              setReplying(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReplyComposer({ root, onDone }: { root: LocalComment; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const specs = useAppStore((s) => s.agentSpecs);
  const replyToComment = useAppStore((s) => s.replyToComment);

  // Prefer talking to the agent that wrote the root comment.
  const agentName =
    (root.author_kind === "agent" && specs.some((sp) => sp.name === root.author_name)
      ? root.author_name
      : specs[0]?.name) ?? "";

  const send = () => {
    if (!body.trim() || !agentName) return;
    setSending(true);
    void replyToComment(root.id, body.trim(), agentName).then(() => {
      setSending(false);
      onDone();
    });
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
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          if (e.key === "Escape") onDone();
        }}
        placeholder={
          agentName
            ? `reply — ${agentName} will answer in this thread (⌘↵)`
            : "configure an agent in settings to discuss comments"
        }
        className="min-h-14 w-full resize-y rounded-md border border-edge bg-ground p-2 text-xs text-cream outline-none focus:border-sky"
      />
      <div className="flex items-center gap-2">
        <Button kind="primary" onClick={send} disabled={!body.trim() || !agentName || sending}>
          <Reply size={11} /> reply
        </Button>
        <Button onClick={onDone}>cancel</Button>
        {sending ? <Spinner label="starting agent…" /> : null}
      </div>
    </div>
  );
}

export function CommentCard(props: {
  comment: LocalComment;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const { comment } = props;
  const setCommentStatus = useAppStore((s) => s.setCommentStatus);
  const deleteComment = useAppStore((s) => s.deleteComment);

  return (
    <div className="text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-medium text-cream">
          {comment.author_kind === "agent" ? <Bot size={12} /> : <User size={12} />}
          {comment.author_name}
        </span>
        <Pill tone="sky">local</Pill>
        {!props.isReply ? (
          <Pill tone={severityTone(comment.severity)}>{comment.severity}</Pill>
        ) : null}
        {comment.status !== "open" && !props.isReply ? (
          <Pill tone="muted">{comment.status}</Pill>
        ) : null}
        <span className="ml-auto text-[11px] text-muted">{relativeTime(comment.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed text-cream/90">{comment.body}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {props.isReply ? null : comment.status === "open" ? (
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
            title="reopen"
          >
            <RotateCcw size={11} /> reopen
          </Button>
        )}
        {props.onReply ? (
          <Button onClick={props.onReply} title="reply — the agent answers in-thread">
            <Reply size={11} /> reply
          </Button>
        ) : null}
        {!props.isReply && comment.status !== "archived" ? (
          <Button
            onClick={() => {
              void setCommentStatus(comment.id, "archived");
            }}
            title="archive — keep the record, hide it from the review"
          >
            <Archive size={11} /> archive
          </Button>
        ) : null}
        <button
          type="button"
          title="delete permanently"
          onClick={() => {
            void deleteComment(comment.id);
          }}
          className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-ember/15 hover:text-ember"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function GithubCommentCard({ comment }: { comment: GithubComment }) {
  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 font-medium text-cream">
          <User size={12} /> {comment.author.login}
        </span>
        <Pill tone="muted">
          <Globe size={10} /> github
        </Pill>
        <span className="ml-auto text-[11px] text-muted">{relativeTime(comment.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed text-cream/90">{comment.body}</div>
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
      parent_id: null,
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
        placeholder={`local comment on ${props.path}:${String(props.line)} (⌘↵ to save)`}
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
          add local comment
        </Button>
        <Button onClick={props.onDone}>cancel</Button>
      </div>
    </div>
  );
}
