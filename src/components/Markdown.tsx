// Markdown renderer for comment bodies (GitHub-flavored: tables, code
// fences, task lists). Inline HTML (e.g. <sub> from bots) renders via
// rehype-raw and is sanitized; HTML comments are stripped. Styling in
// styles.css (.md-body).

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function MarkdownBody({ text }: { text: string }) {
  const cleaned = text.replace(/<!--[\s\S]*?-->/g, "");
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
