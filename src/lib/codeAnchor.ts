// `tandem://src/x.rs#L42` links, which agent summaries use to point at
// the code they're discussing. Resolving one scrolls the diff to that
// file and flashes the line.

import { fileAnchorId } from "./format";

export interface CodeAnchor {
  path: string;
  /** Line on the new side; absent when the link names only a file. */
  line: number | null;
}

export function parseCodeAnchor(href: string | undefined): CodeAnchor | null {
  if (!href?.startsWith("tandem://")) return null;
  const rest = href.slice("tandem://".length);
  if (!rest) return null;
  const [path, hash] = rest.split("#");
  if (!path) return null;
  const line = /^L(\d+)$/i.exec(hash ?? "");
  return { path, line: line?.[1] ? Number(line[1]) : null };
}

/** Scroll to the anchored line, falling back to the file heading when
 * the line isn't in the rendered diff (collapsed file, or the summary
 * points at a line the latest diff no longer has). */
export function scrollToCodeAnchor(anchor: CodeAnchor): void {
  const file = document.getElementById(fileAnchorId(anchor.path));
  if (!file) return;
  const row =
    anchor.line === null
      ? null
      : file.querySelector<HTMLElement>(`[data-new-line="${String(anchor.line)}"]`);
  const target = row ?? file;
  target.scrollIntoView({ behavior: "smooth", block: row ? "center" : "start" });
  if (!row) return;
  row.classList.add("flash-target");
  setTimeout(() => {
    row.classList.remove("flash-target");
  }, 3200);
}
