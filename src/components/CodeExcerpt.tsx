// The lines a comment is actually about. In the diff you can see them
// by scrolling; in a floating pane there's nothing around the comment
// but its file name, so the code has to come along — folded away until
// you ask for it.

import { ChevronRight, Code2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ipc } from "../lib/ipc";
import type { DiffLine, FileDiff, FileExcerpt, RepoRef } from "../lib/types";

/** Lines either side of the anchor. Enough to read the change in
 * context, not so much that the comment scrolls off. */
const PADDING = 4;

function lineNumber(line: DiffLine, side: "old" | "new"): number | null {
  return side === "old" ? line.old_line : line.new_line;
}

/** The hunk lines around `line`, or null when the diff doesn't have
 * them — a comment can outlive the diff it was written against. */
function excerpt(
  diff: FileDiff[],
  path: string,
  line: number,
  side: "old" | "new",
): DiffLine[] | null {
  const file = diff.find((f) => f.new_path === path || f.old_path === path);
  if (!file) return null;
  for (const hunk of file.hunks) {
    const at = hunk.lines.findIndex((l) => lineNumber(l, side) === line);
    if (at === -1) continue;
    return hunk.lines.slice(Math.max(0, at - PADDING), at + PADDING + 1);
  }
  return null;
}

const TONE: Record<string, string> = {
  added: "bg-moss/10 text-moss",
  removed: "bg-ember/10 text-ember",
  context: "text-muted",
};

export function CodeExcerpt({
  diff,
  path,
  line,
  side,
  repo,
  gitRef,
}: {
  diff: FileDiff[];
  path: string;
  line: number;
  side: "old" | "new";
  /** Where to read the file when the line isn't in the diff — an agent
   * with a checkout cites lines this PR never touched. */
  repo?: RepoRef;
  gitRef?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<FileExcerpt | "loading" | "failed" | null>(null);

  const lines = open && path && line > 0 ? excerpt(diff, path, line, side) : null;
  const needsFile = open && lines === null && repo !== undefined && gitRef !== undefined;

  useEffect(() => {
    if (!needsFile || fetched !== null) return;
    setFetched("loading");
    ipc
      .getFileExcerpt(`${repo.owner}/${repo.name}`, path, gitRef, line, PADDING)
      .then(setFetched)
      .catch((e: unknown) => {
        console.warn("couldn't read the file", e);
        setFetched("failed");
      });
  }, [needsFile, fetched, repo, gitRef, path, line]);

  if (!path || line === 0) return null;

  return (
    <div className="mt-1.5 overflow-hidden rounded-md border border-edge/60 bg-panel-2/40">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-cream"
      >
        <ChevronRight size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <Code2 size={11} />
        <span className="truncate font-mono">
          {path}:{line}
        </span>
        <span className="ml-auto shrink-0">{open ? "hide code" : "show code"}</span>
      </button>
      {open ? (
        lines === null ? (
          <FromFile excerpt={fetched} anchor={line} />
        ) : (
          <div className="overflow-x-auto border-t border-edge/60 py-1">
            {lines.map((l, i) => {
              const n = lineNumber(l, side);
              const anchor = n === line;
              return (
                <div
                  key={`${String(n ?? 0)}-${String(i)}`}
                  className={`flex gap-2 whitespace-pre px-2 font-mono text-[10px] leading-[1.6] ${
                    TONE[l.kind] ?? "text-cream"
                  } ${anchor ? "bg-sky/15 text-cream" : ""}`}
                >
                  <span className="w-8 shrink-0 select-none text-right text-muted/70">
                    {n ?? ""}
                  </span>
                  <span className="shrink-0 select-none text-muted/70">
                    {l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " "}
                  </span>
                  <span>{l.content}</span>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

/** The file's own lines, for an anchor the diff doesn't contain. No
 * +/- gutter — nothing here changed in this PR. */
function FromFile({
  excerpt,
  anchor,
}: {
  excerpt: FileExcerpt | "loading" | "failed" | null;
  anchor: number;
}) {
  if (excerpt === null || excerpt === "loading") {
    return <div className="px-2 py-1.5 text-[10px] text-muted">reading the file…</div>;
  }
  if (excerpt === "failed") {
    return (
      <div className="px-2 py-1.5 text-[10px] text-muted">
        couldn&apos;t read that file from GitHub — it may have been renamed or removed since
      </div>
    );
  }
  return (
    <div className="overflow-x-auto border-t border-edge/60 py-1">
      <div className="px-2 pb-1 text-[9px] uppercase tracking-wide text-muted/70">
        not part of this diff — shown from the file
      </div>
      {excerpt.lines.map((content, i) => {
        const n = excerpt.start_line + i;
        return (
          <div
            key={n}
            className={`flex gap-2 whitespace-pre px-2 font-mono text-[10px] leading-[1.6] ${
              n === anchor ? "bg-sky/15 text-cream" : "text-muted"
            }`}
          >
            <span className="w-8 shrink-0 select-none text-right text-muted/70">{n}</span>
            <span>{content}</span>
          </div>
        );
      })}
    </div>
  );
}
