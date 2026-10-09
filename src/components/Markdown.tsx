// Markdown renderer for comment bodies (GitHub-flavored: tables, code
// fences, task lists). Inline HTML (e.g. <sub> from bots) renders via
// rehype-raw and is sanitized; HTML comments are stripped; @mentions of
// the signed-in user get a highlight mark. Styling in styles.css.

import type { Element, ElementContent, Root } from "hast";
import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { parseCodeAnchor, scrollToCodeAnchor } from "../lib/codeAnchor";
import { useAppStore } from "../state/store";

// Sanitize strips unknown URL schemes, so `tandem:` has to be allowed
// explicitly for agent summaries to link into the diff.
const SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "tandem"],
  },
};

/** Renders `tandem://path#L42` as an in-app jump; everything else is a
 * normal link. */
function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const anchor = parseCodeAnchor(href);
  if (anchor === null) return <a href={href}>{children}</a>;
  return (
    <button
      type="button"
      title={`jump to ${anchor.path}${anchor.line === null ? "" : `:${String(anchor.line)}`}`}
      onClick={() => {
        scrollToCodeAnchor(anchor);
      }}
      className="text-sky underline underline-offset-2 hover:text-cream"
    >
      {children}
    </button>
  );
}

/** Wrap `@login` occurrences in text nodes with <mark class="mention-you">.
 * Runs after sanitize so the mark survives; code/pre are left alone. */
function rehypeHighlightMention(login: string) {
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`@${escaped}(?![\\w-])`, "gi");

  const split = (value: string): ElementContent[] | null => {
    const parts: ElementContent[] = [];
    let last = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index;
      if (index > last) parts.push({ type: "text", value: value.slice(last, index) });
      parts.push({
        type: "element",
        tagName: "mark",
        properties: { className: ["mention-you"] },
        children: [{ type: "text", value: match[0] }],
      });
      last = index + match[0].length;
    }
    if (parts.length === 0) return null;
    if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
    return parts;
  };

  const walk = (node: Root | Element) => {
    if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) return;
    node.children = node.children.flatMap((child): ElementContent[] => {
      if (child.type === "text") {
        return split(child.value) ?? [child];
      }
      if (child.type === "element") walk(child);
      return [child as ElementContent];
    });
  };

  return () => (tree: Root) => {
    walk(tree);
  };
}

export function MarkdownBody({ text }: { text: string }) {
  const viewer = useAppStore((s) => s.viewer);
  const cleaned = text.replace(/<!--[\s\S]*?-->/g, "");
  const plugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
    rehypeRaw,
    [rehypeSanitize, SCHEMA],
    ...(viewer ? [rehypeHighlightMention(viewer)] : []),
  ];
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={plugins}
        components={{ a: MarkdownLink }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
