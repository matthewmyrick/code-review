// Right-panel comment overview: local threads by status, archived
// tucked away, and read-only GitHub comments at the bottom.

import type { LocalComment } from "../lib/types";
import { useAppStore } from "../state/store";
import { CommentThread, GithubCommentCard, groupThreads } from "./comments";

interface Thread {
  root: LocalComment;
  replies: LocalComment[];
}

export function CommentsPanel() {
  const bundle = useAppStore((s) => s.bundle);
  const comments = bundle?.comments ?? [];
  const githubComments = bundle?.detail.comments ?? [];

  const threads = groupThreads(comments);
  const open = threads.filter((t) => t.root.status === "open");
  const triaged = threads.filter((t) => t.root.status !== "open" && t.root.status !== "archived");
  const archived = threads.filter((t) => t.root.status === "archived");

  if (threads.length === 0 && githubComments.length === 0) {
    return (
      <div className="p-4 text-center text-xs leading-relaxed text-muted">
        no comments yet — hover a diff line and hit +, or run an agent review
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {open.length > 0 ? <SectionLabel text={`open (${String(open.length)})`} /> : null}
      {open.map((t) => (
        <ThreadCard key={t.root.id} thread={t} />
      ))}

      {triaged.length > 0 ? <SectionLabel text={`triaged (${String(triaged.length)})`} /> : null}
      {triaged.map((t) => (
        <ThreadCard key={t.root.id} thread={t} />
      ))}

      {archived.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted hover:text-cream">
            archived ({archived.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2 opacity-75">
            {archived.map((t) => (
              <ThreadCard key={t.root.id} thread={t} />
            ))}
          </div>
        </details>
      ) : null}

      {githubComments.length > 0 ? (
        <>
          <SectionLabel text={`on github (${String(githubComments.length)})`} />
          {githubComments.map((c) => (
            <div key={c.id} className="rounded-lg border border-edge/70 bg-panel p-2.5">
              {c.path ? (
                <div className="mb-1 truncate font-mono text-[11px] text-muted">
                  {c.path}
                  {c.line !== null ? `:${String(c.line)}` : ""}
                </div>
              ) : null}
              <GithubCommentCard comment={c} />
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">{text}</div>;
}

function ThreadCard({ thread }: { thread: Thread }) {
  return (
    <div className="animate-fade-up rounded-lg border border-edge bg-panel p-2.5">
      <div className="mb-1 truncate font-mono text-[11px] text-sky">
        {thread.root.path}:{thread.root.line}
      </div>
      <CommentThread root={thread.root} replies={thread.replies} />
    </div>
  );
}
