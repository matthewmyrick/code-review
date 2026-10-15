// One thread, floating over whatever you were doing. Opened from the
// agent runs dashboard: a finished thread reply is something you read
// and answer, not a reason to lose your place in another PR.

import { create } from "zustand";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ipc } from "../lib/ipc";
import { openExternal, prUrl } from "../lib/open";
import type { FileDiff, LocalComment } from "../lib/types";
import { CodeExcerpt } from "./CodeExcerpt";
import { CommentThread, groupThreads } from "./comments";
import { useHighlight } from "../state/notifications";
import { useAppStore } from "../state/store";
import { Button, Modal, Spinner } from "./ui";

interface Target {
  repo: string;
  number: number;
  commentId: string;
}

interface ThreadPaneStore {
  target: Target | null;
  open: (target: Target) => void;
  close: () => void;
}

export const useThreadPane = create<ThreadPaneStore>((set) => ({
  target: null,
  open: (target) => {
    set({ target });
  },
  close: () => {
    set({ target: null });
  },
}));

export function ThreadPane() {
  const target = useThreadPane((s) => s.target);
  const close = useThreadPane((s) => s.close);
  const openPr = useAppStore((s) => s.openPr);
  const setHighlight = useHighlight((s) => s.set);
  const [comments, setComments] = useState<LocalComment[] | null>(null);
  const [diff, setDiff] = useState<FileDiff[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (target === null) return;
    setComments(null);
    let live = true;
    // Cache-first, like everything else — the bundle carries both the
    // thread and the diff the comment is anchored to.
    ipc
      .getPrBundle(target.repo, target.number)
      .then((bundle) => {
        if (!live) return;
        setComments(bundle?.comments ?? []);
        setDiff(bundle?.diff ?? []);
      })
      .catch((e: unknown) => {
        console.warn("couldn't load thread", e);
        if (live) setComments([]);
      });
    return () => {
      live = false;
    };
  }, [target]);

  // The latest reply is what you opened this for; a long thread would
  // otherwise make you scroll past everything you've already read.
  useEffect(() => {
    if (comments === null) return;
    const id = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end" });
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [comments]);

  if (target === null) return null;

  const thread =
    comments === null
      ? null
      : (groupThreads(comments).find(
          (t) => t.root.id === target.commentId || t.replies.some((r) => r.id === target.commentId),
        ) ?? null);

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">
            {target.repo}#{target.number}
          </span>
          <span className="text-muted">thread</span>
        </span>
      }
      onClose={close}
    >
      {comments === null ? (
        <Spinner label="loading the thread…" />
      ) : thread === null ? (
        <div className="py-8 text-center text-xs text-muted">
          that thread is gone — it may have been deleted, or the PR&apos;s data purged after it
          merged
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <CodeExcerpt
            diff={diff}
            path={thread.root.path}
            line={thread.root.line}
            side={thread.root.side}
          />
          <CommentThread root={thread.root} replies={thread.replies} />
          <div ref={endRef} />
          <div className="flex justify-end gap-2 border-t border-edge/60 pt-2">
            <Button
              kind="primary"
              onClick={() => {
                // Same landing as a click from the runs dashboard: the
                // PR, scrolled to this thread.
                close();
                void openPr(target.repo, target.number);
                setHighlight({ commentId: thread.root.id });
              }}
              title="open this PR in Tandem, scrolled to the thread"
            >
              <GitPullRequest size={12} /> open PR in Tandem
            </Button>
            <Button
              onClick={() => {
                openExternal(prUrl(thread.root.repo, thread.root.pr_number));
              }}
              title="open the pull request on github.com"
            >
              <ExternalLink size={12} /> github
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
