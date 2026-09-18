// Right-panel comment overview. Each thread shows as a compact summary
// card (huge plan-style comments stay two lines here); clicking a card
// opens the full thread in a centered floating pane with replies and
// actions. Sections: open / triaged / archived / on github.

import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { useAppStore } from "../state/store";
import { CommentThread, GithubCommentCard, groupThreads } from "./comments";
import { GithubReplyComposer } from "./GithubReplyComposer";
import { MarkdownBody } from "./Markdown";
import { InlineCommentForm } from "./InlineCommentForm";
import type { Selected } from "./PanelCards";
import { GithubSummary, ReviewSummary, ThreadSummary, verdictTone } from "./PanelCards";
import { Button, GithubMark, Modal, Pill } from "./ui";

export function CommentsPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const [selected, setSelected] = useState<Selected>(null);
  const comments = bundle?.comments ?? [];
  const githubComments = bundle?.detail.comments ?? [];
  const reviewBodies = bundle?.detail.review_bodies ?? [];

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
  const selectedReview =
    selected?.kind === "review" ? (reviewBodies.find((r) => r.id === selected.id) ?? null) : null;

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
      {open.length > 0 ? <SectionLabel text={`open · local (${String(open.length)})`} /> : null}
      {open.map((t) => (
        <ThreadSummary key={t.root.id} thread={t} onOpen={setSelected} />
      ))}

      {triaged.length > 0 ? (
        <SectionLabel text={`resolved · local (${String(triaged.length)})`} />
      ) : null}
      {triaged.map((t) => (
        <ThreadSummary key={t.root.id} thread={t} onOpen={setSelected} />
      ))}

      {githubComments.length + reviewBodies.length > 0 ? (
        <>
          <SectionLabel
            text={`on github (${String(githubComments.length + reviewBodies.length)})`}
          />
          {reviewBodies.map((r) => (
            <ReviewSummary key={r.id} review={r} onOpen={setSelected} />
          ))}
          {githubComments.map((c) => (
            <GithubSummary key={c.id} comment={c} onOpen={setSelected} />
          ))}
        </>
      ) : null}

      {archived.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted hover:text-cream">
            archived · local ({archived.length})
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
          <ReplySection
            path={selectedGithub.path ?? ""}
            line={selectedGithub.line ?? 0}
            githubCommentId={selectedGithub.id}
            reviewCommentId={selectedGithub.path !== null ? selectedGithub.id : undefined}
          />
        </Modal>
      ) : null}

      {selectedReview ? (
        <Modal
          title={
            <span className="inline-flex items-center gap-1.5">
              <GithubMark size={11} /> review by {selectedReview.author.login}
            </span>
          }
          onClose={() => {
            setSelected(null);
          }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs">
            <Pill tone={verdictTone(selectedReview.verdict)}>
              {selectedReview.verdict.replace("_", " ")}
            </Pill>
          </div>
          <MarkdownBody text={selectedReview.body} />
          <ReplySection path="" line={0} />
        </Modal>
      ) : null}

      {selected?.kind === "new-general" ? (
        <Modal
          title="new general comment (local)"
          onClose={() => {
            setSelected(null);
          }}
        >
          <ReplySection
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

/** Composer area with a mode toggle: draft a local thread (default) or
 * reply straight on GitHub. */
function ReplySection(props: {
  path: string;
  line: number;
  githubCommentId?: number;
  reviewCommentId?: number;
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<"local" | "github">("local");
  return (
    <div className="mt-4 border-t border-edge pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        {(["local", "github"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
            }}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              mode === m ? "bg-sky/20 text-sky" : "bg-panel-2 text-muted hover:text-cream"
            }`}
          >
            {m === "local" ? "reply locally" : "reply on github"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted">
          {mode === "local"
            ? "stays in Tandem until you post it"
            : "posts under your account after confirm"}
        </span>
      </div>
      {mode === "local" ? (
        <FreshComposer
          path={props.path}
          line={props.line}
          githubCommentId={props.githubCommentId}
          onDone={props.onDone}
        />
      ) : (
        <GithubReplyComposer reviewCommentId={props.reviewCommentId} onDone={props.onDone} />
      )}
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
