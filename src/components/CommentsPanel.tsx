// Right-panel comment overview. Each thread shows as a compact summary
// card (huge plan-style comments stay two lines here); clicking a card
// opens the full thread in a centered floating pane with replies and
// actions. Sections: open / triaged / archived / on github.

import { Bot, MessageSquare, MessageSquarePlus, Send, User } from "lucide-react";
import { useState } from "react";

import { relativeTime } from "../lib/format";
import type { GithubComment, LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { CommentThread, GithubCommentCard, groupThreads } from "./comments";
import { InlineCommentForm } from "./InlineCommentForm";
import { Button, GithubMark, Modal, Pill, severityTone } from "./ui";

interface Thread {
  root: LocalComment;
  replies: LocalComment[];
}

type Selected =
  { kind: "local"; id: string } | { kind: "github"; id: number } | { kind: "new-general" } | null;

/** Plain-text preview of a (possibly huge) markdown body. */
function preview(body: string): string {
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("```"))
    .join(" ")
    .replace(/[`#>*_|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export function CommentsPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const [selected, setSelected] = useState<Selected>(null);
  const comments = bundle?.comments ?? [];
  const githubComments = bundle?.detail.comments ?? [];

  const threads = groupThreads(comments);
  const open = threads.filter((t) => t.root.status === "open");
  const triaged = threads.filter((t) => t.root.status !== "open" && t.root.status !== "archived");
  const archived = threads.filter((t) => t.root.status === "archived");

  // Resolve the selection against live store data so the modal updates
  // as replies stream in.
  const selectedThread =
    selected?.kind === "local" ? (threads.find((t) => t.root.id === selected.id) ?? null) : null;
  const selectedGithub =
    selected?.kind === "github" ? (githubComments.find((c) => c.id === selected.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <Button
        onClick={() => {
          setSelected({ kind: "new-general" });
        }}
        title="a PR-level local comment, not tied to any code line"
      >
        <MessageSquarePlus size={12} /> general comment
      </Button>
      {threads.length === 0 && githubComments.length === 0 ? (
        <div className="p-4 text-center text-xs leading-relaxed text-muted">
          no comments yet — hover a diff line and hit +, or run an agent review
        </div>
      ) : null}
      {open.length > 0 ? <SectionLabel text={`open (${String(open.length)})`} /> : null}
      {open.map((t) => (
        <ThreadSummary key={t.root.id} thread={t} onOpen={setSelected} />
      ))}

      {triaged.length > 0 ? <SectionLabel text={`triaged (${String(triaged.length)})`} /> : null}
      {triaged.map((t) => (
        <ThreadSummary key={t.root.id} thread={t} onOpen={setSelected} />
      ))}

      {githubComments.length > 0 ? (
        <>
          <SectionLabel text={`on github (${String(githubComments.length)})`} />
          {githubComments.map((c) => (
            <GithubSummary key={c.id} comment={c} onOpen={setSelected} />
          ))}
        </>
      ) : null}

      {archived.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted hover:text-cream">
            archived ({archived.length})
          </summary>
          <div className="mt-1.5 flex flex-col gap-1.5 opacity-75">
            {archived.map((t) => (
              <ThreadSummary key={t.root.id} thread={t} onOpen={setSelected} />
            ))}
          </div>
        </details>
      ) : null}

      {selectedThread ? (
        <Modal
          title={
            selectedThread.root.path ? (
              <span className="font-mono text-sky">
                {selectedThread.root.path}:{selectedThread.root.line}
              </span>
            ) : (
              "PR comment (local)"
            )
          }
          onClose={() => {
            setSelected(null);
          }}
        >
          <CommentThread root={selectedThread.root} replies={selectedThread.replies} />
        </Modal>
      ) : null}

      {selectedGithub ? (
        <Modal
          title={
            <span className="inline-flex items-center gap-1.5">
              <GithubMark size={11} />
              {selectedGithub.path ? (
                <span className="font-mono text-sky">
                  {selectedGithub.path}
                  {selectedGithub.line !== null ? `:${String(selectedGithub.line)}` : ""}
                </span>
              ) : (
                "PR comment"
              )}
            </span>
          }
          onClose={() => {
            setSelected(null);
          }}
        >
          <GithubCommentCard comment={selectedGithub} />
          {threads
            .filter((t) => t.root.github_comment_id === selectedGithub.id)
            .map((t) => (
              <div key={t.root.id} className="mt-3 rounded-lg border border-edge bg-panel-2/40 p-3">
                <CommentThread root={t.root} replies={t.replies} />
              </div>
            ))}
          <div className="mt-4 border-t border-edge pt-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
              reply locally — post to github when you choose
            </div>
            <FreshComposer
              path={selectedGithub.path ?? ""}
              line={selectedGithub.line ?? 0}
              githubCommentId={selectedGithub.id}
            />
          </div>
        </Modal>
      ) : null}

      {selected?.kind === "new-general" ? (
        <Modal
          title="new general comment (local)"
          onClose={() => {
            setSelected(null);
          }}
        >
          <FreshComposer
            path=""
            line={0}
            onDone={() => {
              setSelected(null);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

/** Composer that resets itself after each send so it can live inside a
 * modal permanently. */
function FreshComposer(props: {
  path: string;
  line: number;
  githubCommentId?: number;
  onDone?: () => void;
}) {
  const [generation, setGeneration] = useState(0);
  return (
    <InlineCommentForm
      key={generation}
      path={props.path}
      line={props.line}
      side="new"
      githubCommentId={props.githubCommentId}
      onDone={() => {
        setGeneration((g) => g + 1);
        props.onDone?.();
      }}
    />
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="mt-1.5 text-[11px] uppercase tracking-wide text-muted">{text}</div>;
}

function ThreadSummary(props: { thread: Thread; onOpen: (s: Selected) => void }) {
  const { root, replies } = props.thread;
  return (
    <button
      type="button"
      onClick={() => {
        props.onOpen({ kind: "local", id: root.id });
      }}
      className="animate-fade-up block w-full rounded-lg border border-edge bg-panel p-2.5 text-left transition-all hover:border-sky/40 hover:bg-panel-2/60"
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 font-medium text-cream">
          {root.author_kind === "agent" ? <Bot size={11} /> : <User size={11} />}
          {root.author_name}
        </span>
        <Pill tone={severityTone(root.severity)}>{root.severity}</Pill>
        {root.status !== "open" ? <Pill tone="muted">{root.status}</Pill> : null}
        {root.posted_github_id !== null ? (
          <Pill tone="moss">
            <Send size={9} /> posted
          </Pill>
        ) : null}
        <span className="ml-auto text-[10px] text-muted">{relativeTime(root.created_at)}</span>
      </div>
      <div className="truncate font-mono text-[10px] text-sky">
        {root.path ? `${root.path}:${String(root.line)}` : "PR comment"}
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-cream/85">
        {preview(root.body)}
      </div>
      {replies.length > 0 ? (
        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted">
          <MessageSquare size={10} /> {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>
      ) : null}
    </button>
  );
}

function GithubSummary(props: { comment: GithubComment; onOpen: (s: Selected) => void }) {
  const { comment } = props;
  return (
    <button
      type="button"
      onClick={() => {
        props.onOpen({ kind: "github", id: comment.id });
      }}
      className="animate-fade-up block w-full rounded-lg border border-edge border-l-4 border-l-fur/70 bg-fur/10 p-2.5 text-left transition-all hover:border-sky/40"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 font-medium text-cream">
          <User size={11} /> {comment.author.login}
        </span>
        <Pill tone="github">
          <GithubMark size={9} /> github
        </Pill>
        <span className="ml-auto text-[10px] text-muted">{relativeTime(comment.created_at)}</span>
      </div>
      {comment.path ? (
        <div className="truncate font-mono text-[10px] text-muted">
          {comment.path}
          {comment.line !== null ? `:${String(comment.line)}` : ""}
        </div>
      ) : null}
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-cream/85">
        {preview(comment.body)}
      </div>
    </button>
  );
}
