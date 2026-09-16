// Inline comment composer for the differ: anchors to a line (or a
// range), supports @agent mentions, and can attach the new local thread
// to an existing GitHub comment.

import { useState } from "react";

import type { CommentSeverity, DiffSide } from "../lib/types";
import { useAppStore } from "../state/store";
import { extractMentions, MentionInput } from "./MentionInput";
import { Button } from "./ui";

export function InlineCommentForm(props: {
  path: string;
  line: number;
  side: DiffSide;
  onDone: () => void;
  endLine?: number;
  onEndLineChange?: (end: number) => void;
  githubCommentId?: number;
}) {
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<CommentSeverity>("suggestion");
  const bundle = useAppStore((s) => s.bundle);
  const specs = useAppStore((s) => s.agentSpecs);
  const addComment = useAppStore((s) => s.addComment);
  const mentionAgent = useAppStore((s) => s.mentionAgent);

  if (!bundle) return null;
  const pr = bundle.detail.pull_request;
  const endLine = props.endLine ?? props.line;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const mentions = extractMentions(
      text,
      specs.map((sp) => sp.name),
    );
    void addComment({
      repo: pr.repo,
      pr_number: pr.number,
      head_sha: pr.head_sha,
      path: props.path,
      side: props.side,
      line: props.line,
      end_line: endLine > props.line ? endLine : null,
      body: text,
      author_kind: "human",
      author_name: "you",
      severity,
      run_id: null,
      parent_id: null,
      github_comment_id: props.githubCommentId ?? null,
    }).then(async (created) => {
      if (created) {
        for (const name of mentions) await mentionAgent(name, created.id);
      }
      props.onDone();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <MentionInput
        value={body}
        onChange={setBody}
        onSubmit={submit}
        onCancel={props.onDone}
        mono
        placeholder={`local comment on ${props.path}:${String(props.line)}${
          endLine > props.line ? `–${String(endLine)}` : ""
        } — @mention an agent to investigate (⌘↵ to save)`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as CommentSeverity);
          }}
          className="rounded-md border border-edge bg-panel-2 px-2 py-1 text-xs text-cream"
        >
          <option value="info">info</option>
          <option value="suggestion">suggestion</option>
          <option value="issue">issue</option>
          <option value="blocker">blocker</option>
        </select>
        {props.onEndLineChange ? (
          <label className="flex items-center gap-1 text-[11px] text-muted">
            to line
            <input
              type="number"
              min={props.line}
              value={endLine}
              onChange={(e) => {
                props.onEndLineChange?.(Math.max(props.line, Number(e.target.value) || props.line));
              }}
              className="w-16 rounded-md border border-edge bg-panel-2 px-1.5 py-1 text-xs text-cream"
            />
          </label>
        ) : null}
        <Button kind="primary" onClick={submit} disabled={!body.trim()}>
          add local comment
        </Button>
        <Button onClick={props.onDone}>cancel</Button>
      </div>
    </div>
  );
}
