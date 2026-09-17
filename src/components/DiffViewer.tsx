// The differ: renders structured FileDiffs with syntax highlighting and
// per-line commenting. Hover a line and hit + (or click a line number)
// to attach a local comment — never posted to GitHub.

import { ChevronDown, ChevronRight, CornerDownRight, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fileAnchorId } from "../lib/format";
import { highlightLine, languageForPath } from "../lib/highlight";
import type { FileDiff, GithubComment, LocalComment } from "../lib/types";
import { CommentThread, GithubCommentCard, groupThreads } from "./comments";
import { InlineComposerSection } from "./InlineCommentForm";
import { Pill } from "./ui";

interface DiffViewerProps {
  diff: FileDiff[];
  comments: LocalComment[];
  githubComments: GithubComment[];
}

export function DiffViewer({ diff, comments, githubComments }: DiffViewerProps) {
  if (diff.length === 0) {
    return <div className="p-6 text-center text-xs text-muted">diff not loaded yet</div>;
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      {diff.map((file) => (
        <FileCard
          key={`${file.old_path}:${file.new_path}`}
          file={file}
          comments={comments.filter((c) => c.path === file.new_path || c.path === file.old_path)}
          githubComments={githubComments.filter(
            (c) => c.path === file.new_path || c.path === file.old_path,
          )}
        />
      ))}
    </div>
  );
}

function statusPill(file: FileDiff) {
  switch (file.status) {
    case "added":
      return <Pill tone="moss">added</Pill>;
    case "removed":
      return <Pill tone="ember">deleted</Pill>;
    case "renamed":
      return <Pill tone="amber">renamed</Pill>;
    case "modified":
      return null;
  }
}

interface FileCardProps {
  file: FileDiff;
  comments: LocalComment[];
  githubComments: GithubComment[];
}

function FileCard({ file, comments, githubComments }: FileCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const displayPath = file.status === "removed" ? file.old_path : file.new_path;
  const language = languageForPath(displayPath);
  const commentCount = comments.length + githubComments.length;

  return (
    <section
      id={fileAnchorId(displayPath)}
      className="animate-fade-up scroll-mt-3 overflow-hidden rounded-xl border border-edge bg-panel shadow-sm"
    >
      <button
        type="button"
        onClick={() => {
          setCollapsed((c) => !c);
        }}
        className="flex w-full items-center gap-2 border-b border-edge bg-panel-2/60 px-3 py-2 text-left transition-colors hover:bg-panel-2"
      >
        <span className="text-muted">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
        <span className="truncate font-mono text-xs text-cream">{displayPath}</span>
        {file.status === "renamed" ? (
          <span className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-muted">
            <CornerDownRight size={11} /> from {file.old_path}
          </span>
        ) : null}
        {statusPill(file)}
        {commentCount > 0 ? (
          <Pill tone="sky">
            <MessageSquare size={11} /> {commentCount}
          </Pill>
        ) : null}
        <span className="ml-auto shrink-0 text-[11px]">
          <span className="text-moss">+{file.additions}</span>{" "}
          <span className="text-ember">−{file.deletions}</span>
        </span>
      </button>

      {collapsed ? null : file.is_binary ? (
        <div className="px-3 py-4 text-center text-xs text-muted">binary file</div>
      ) : (
        file.hunks.map((hunk, i) => (
          <HunkView
            key={i}
            path={displayPath}
            language={language}
            hunk={hunk}
            comments={comments}
            githubComments={githubComments}
          />
        ))
      )}
    </section>
  );
}

interface HunkProps {
  path: string;
  language: string | null;
  hunk: FileDiff["hunks"][number];
  comments: LocalComment[];
  githubComments: GithubComment[];
}

interface ComposerAnchor {
  line: number;
  end: number;
  side: "old" | "new";
  githubCommentId?: number;
}

function HunkView({ path, language, hunk, comments, githubComments }: HunkProps) {
  const [commentAt, setCommentAt] = useState<ComposerAnchor | null>(null);
  // Click-drag across line numbers selects a range for the comment.
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      setDragging(false);
    };
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  return (
    <div className="border-b border-edge/40 last:border-b-0">
      <div className="bg-sky/5 px-3 py-1 font-mono text-[11px] text-sky-deep">
        @@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@ {hunk.section}
      </div>
      {hunk.lines.map((line, i) => {
        const anchorSide = line.kind === "removed" ? "old" : "new";
        const anchorLine = line.kind === "removed" ? line.old_line : line.new_line;
        const threads = groupThreads(
          comments.filter(
            (c) => c.side === anchorSide && c.line === anchorLine && c.status !== "archived",
          ),
        );
        const ghAtLine = githubComments.filter(
          (c) => anchorSide === "new" && c.line === anchorLine,
        );
        const inRange =
          commentAt !== null &&
          anchorLine !== null &&
          anchorSide === commentAt.side &&
          anchorLine >= commentAt.line &&
          anchorLine <= commentAt.end;
        const rowClass = `${
          line.kind === "added" ? "diff-added" : line.kind === "removed" ? "diff-removed" : ""
        }${inRange ? " diff-range" : ""}`;
        const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";

        const startDrag = (e: React.MouseEvent) => {
          if (anchorLine === null) return;
          e.preventDefault();
          dragStart.current = anchorLine;
          setCommentAt({ line: anchorLine, end: anchorLine, side: anchorSide });
          setDragging(true);
        };
        const extendDrag = () => {
          const start = dragStart.current;
          if (!dragging || start === null || anchorLine === null) return;
          setCommentAt((c) =>
            c?.side === anchorSide
              ? { ...c, line: Math.min(start, anchorLine), end: Math.max(start, anchorLine) }
              : c,
          );
        };

        return (
          <div key={i}>
            <div className={`group-line relative ${rowClass}`} onMouseEnter={extendDrag}>
              <button
                type="button"
                className="diff-add-btn"
                title="comment on this line (drag to select a range)"
                onMouseDown={startDrag}
              >
                +
              </button>
              <div className="diff-line">
                <button type="button" className="diff-line-num" onMouseDown={startDrag}>
                  {line.old_line ?? ""}
                </button>
                <button type="button" className="diff-line-num" onMouseDown={startDrag}>
                  {line.new_line ?? ""}
                </button>
                <div className="diff-content">
                  <span className="select-none pr-1 text-muted">{marker}</span>
                  <LineContent content={line.content} language={language} />
                </div>
              </div>
            </div>

            {threads.map((thread) => (
              <div key={thread.root.id} className="border-y border-edge/60 bg-panel-2/70 px-4 py-2">
                <CommentThread root={thread.root} replies={thread.replies} />
              </div>
            ))}
            {ghAtLine.map((c) => (
              <div
                key={c.id}
                className="border-y border-edge/60 border-l-4 border-l-fur/70 bg-fur/10 px-4 py-2"
              >
                <GithubCommentCard
                  comment={c}
                  onDiscuss={
                    c.line !== null
                      ? () => {
                          const l = c.line ?? 0;
                          setCommentAt({ line: l, end: l, side: "new", githubCommentId: c.id });
                        }
                      : undefined
                  }
                />
              </div>
            ))}

            {!dragging &&
            commentAt !== null &&
            commentAt.end === anchorLine &&
            commentAt.side === anchorSide ? (
              <div className="border-y border-sky/30 bg-panel-2 px-4 py-2">
                <InlineComposerSection
                  path={path}
                  line={commentAt.line}
                  side={commentAt.side}
                  githubCommentId={commentAt.githubCommentId}
                  endLine={commentAt.end}
                  onEndLineChange={(end) => {
                    setCommentAt({ ...commentAt, end });
                  }}
                  onDone={() => {
                    setCommentAt(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LineContent({ content, language }: { content: string; language: string | null }) {
  const html = language ? highlightLine(content, language) : null;
  if (html === null) return <>{content}</>;
  // hljs escapes its output, so this only injects highlight spans.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
