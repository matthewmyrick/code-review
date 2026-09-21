// A GitHub review-comment thread rendered inline in the diff as a
// collapsed disclosure — including outdated/resolved threads (anchored
// via original_line). Local discussion attached to the thread renders
// BELOW the GitHub comments, and the composer can continue either.

import { MessageSquare, Reply } from "lucide-react";

import type { GithubComment, LocalComment } from "../lib/types";
import { CommentThread, GithubCommentCard } from "./comments";
import { Button, GithubMark } from "./ui";

interface Thread {
  root: LocalComment;
  replies: LocalComment[];
}

interface GithubThreadProps {
  root: GithubComment;
  replies: GithubComment[];
  localThreads: Thread[];
  outdated: boolean;
  onDiscuss: () => void;
}

export function GithubThread(props: GithubThreadProps) {
  const { root, replies, localThreads } = props;
  const count = 1 + replies.length;
  const preview = root.body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[`#>*_|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  return (
    <details className="border-y border-edge/60 border-l-4 border-l-fur/70 bg-fur/10">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-[11px] text-muted hover:text-cream">
        <GithubMark size={10} />
        <span className="font-medium text-cream">{root.author.login}</span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={10} /> {count}
        </span>
        {props.outdated ? (
          <span className="rounded-full bg-edge/60 px-1.5 py-0.5 text-[9px] uppercase">
            outdated
          </span>
        ) : null}
        {localThreads.length > 0 ? (
          <span className="rounded-full bg-sky/15 px-1.5 py-0.5 text-[9px] uppercase text-sky">
            {localThreads.length} local
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{preview}</span>
      </summary>
      <div className="space-y-2 px-4 pb-2.5">
        <GithubCommentCard comment={root} />
        {replies.map((reply) => (
          <div key={reply.id} className="ml-3 border-l-2 border-edge/70 pl-3">
            <GithubCommentCard comment={reply} />
          </div>
        ))}
        {localThreads.map((thread) => (
          <div key={thread.root.id} className="rounded-lg border border-edge bg-panel-2/40 p-2.5">
            <CommentThread root={thread.root} replies={thread.replies} />
          </div>
        ))}
        <Button onClick={props.onDiscuss} title="reply locally or straight on github">
          <Reply size={11} /> discuss
        </Button>
      </div>
    </details>
  );
}
