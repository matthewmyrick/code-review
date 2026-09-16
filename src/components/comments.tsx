// Local review comments: threaded cards (with triage + reply-to-agent)
// and the inline composer. Local comments never touch GitHub; GitHub
// comments render read-only with their own badge.

import { Archive, Bot, Reply, RotateCcw, Send, Trash2, User } from "lucide-react";
import { useState } from "react";

import { relativeTime } from "../lib/format";
import { MarkdownBody } from "./Markdown";
import { extractMentions, MentionInput } from "./MentionInput";
import type { GithubComment, LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, GithubMark, Pill, severityTone, Spinner } from "./ui";

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
  const addComment = useAppStore((s) => s.addComment);
  const mentionAgent = useAppStore((s) => s.mentionAgent);

  // Auto-answer only when the thread was started by an agent; other
  // threads need an explicit @mention to summon one.
  const autoAgent =
    root.author_kind === "agent" && specs.some((sp) => sp.name === root.author_name)
      ? root.author_name
      : null;

  const addReply = (text: string) =>
    addComment({
      repo: root.repo,
      pr_number: root.pr_number,
      head_sha: root.head_sha,
      path: root.path,
      side: root.side,
      line: root.line,
      end_line: root.end_line,
      body: text,
      author_kind: "human",
      author_name: "you",
      severity: "info",
      run_id: null,
      parent_id: root.id,
      github_comment_id: null,
    });

  const send = () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const finish = () => {
      setSending(false);
      onDone();
    };
    const mentions = extractMentions(
      text,
      specs.map((sp) => sp.name),
    );
    if (mentions.length > 0) {
      void addReply(text).then(async () => {
        for (const name of mentions) await mentionAgent(name, root.id);
        finish();
      });
    } else if (autoAgent) {
      void replyToComment(root.id, text, autoAgent).then(finish);
    } else {
      void addReply(text).then(finish);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <MentionInput
        value={body}
        onChange={setBody}
        onSubmit={send}
        onCancel={onDone}
        placeholder={
          autoAgent
            ? `reply — ${autoAgent} answers; @mention to summon others (⌘↵)`
            : "reply — @mention an agent to bring one into this thread (⌘↵)"
        }
      />
      <div className="flex items-center gap-2">
        <Button kind="primary" onClick={send} disabled={!body.trim() || sending}>
          <Reply size={11} /> reply
        </Button>
        <Button onClick={onDone}>cancel</Button>
        {sending ? <Spinner label="sending…" /> : null}
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
      <MarkdownBody text={comment.body} />
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
        <PostToGithub comment={comment} />
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

/// Explicit, two-step "post this comment body to GitHub" control.
function PostToGithub({ comment }: { comment: LocalComment }) {
  const postToGithub = useAppStore((s) => s.postToGithub);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);

  if (comment.posted_github_id !== null) {
    return (
      <Pill tone="moss">
        <Send size={10} /> posted
      </Pill>
    );
  }
  if (posting) return <Spinner label="posting…" />;
  if (confirming) {
    return (
      <>
        <Button
          kind="danger"
          onClick={() => {
            setPosting(true);
            void postToGithub(comment.id).then(() => {
              setPosting(false);
              setConfirming(false);
            });
          }}
          title="this WILL post to GitHub"
        >
          <Send size={11} /> confirm post
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
      onClick={() => {
        setConfirming(true);
      }}
      title="post this comment to GitHub (asks to confirm)"
    >
      <Send size={11} /> post to github
    </Button>
  );
}

export function GithubCommentCard(props: { comment: GithubComment; onDiscuss?: () => void }) {
  const { comment } = props;
  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 font-medium text-cream">
          <User size={12} /> {comment.author.login}
        </span>
        <Pill tone="github">
          <GithubMark size={10} /> github
        </Pill>
        <span className="ml-auto text-[11px] text-muted">{relativeTime(comment.created_at)}</span>
      </div>
      <MarkdownBody text={comment.body} />
      {props.onDiscuss ? (
        <div className="mt-1.5">
          <Button
            onClick={props.onDiscuss}
            title="start a local thread about this GitHub comment — post back only when you choose"
          >
            <Reply size={11} /> discuss locally
          </Button>
        </div>
      ) : null}
    </div>
  );
}
