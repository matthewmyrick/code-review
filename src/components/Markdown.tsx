// Markdown renderer for comment bodies (GitHub-flavored: tables, code
// fences, task lists). react-markdown never injects raw HTML, so agent
// output is safe to render. Element styling lives in styles.css
// (.md-body) so it follows the theme.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
