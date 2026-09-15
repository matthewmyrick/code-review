// Configure "bring your own AI" reviewers: runner, model, prompt, tools,
// and (for the v2 sandbox) the network allowlist.

import { useState } from "react";

import type { AgentSpec, RunnerKind } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button } from "./ui";

const inputClass =
  "w-full rounded-md border border-edge bg-ground px-2 py-1.5 text-xs text-cream outline-none focus:border-sky";

const DEFAULT_PROMPT =
  "Review this pull request for correctness bugs, security issues, and " +
  "significant maintainability problems. Prefer few high-signal comments " +
  "over many nits. Use severity `issue` or `blocker` only when confident.";

function newSpec(): AgentSpec {
  return {
    name: "claude-reviewer",
    runner: { kind: "claude_headless" },
    auth: { kind: "cli_session" },
    model: null,
    allowed_tools: [],
    append_system_prompt: null,
    prompt: DEFAULT_PROMPT,
    env: {},
    network_allowlist: [],
    timeout_minutes: 15,
  };
}

export function AgentEditor() {
  const specs = useAppStore((s) => s.agentSpecs);
  const saveAgentSpec = useAppStore((s) => s.saveAgentSpec);
  const deleteAgentSpec = useAppStore((s) => s.deleteAgentSpec);
  const [editing, setEditing] = useState<AgentSpec | null>(null);

  return (
    <section className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-cream">Agents</h2>
          <p className="mt-0.5 text-xs text-muted">
            bring your own AI — a CLI session (claude, codex), an API key, or a custom command
          </p>
        </div>
        <Button
          kind="primary"
          onClick={() => {
            setEditing(newSpec());
          }}
        >
          + new agent
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {specs.map((spec) => (
          <div
            key={spec.name}
            className="flex items-center gap-2 rounded-md bg-panel-2 px-2 py-1.5 text-xs"
          >
            <span className="font-medium text-cream">🤖 {spec.name}</span>
            <span className="text-muted">{spec.runner.kind}</span>
            {spec.model ? <span className="font-mono text-muted">{spec.model}</span> : null}
            <div className="ml-auto flex gap-1.5">
              <Button
                onClick={() => {
                  setEditing(spec);
                }}
              >
                edit
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  void deleteAgentSpec(spec.name);
                }}
              >
                delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <SpecForm
          spec={editing}
          onSave={(spec) => {
            void saveAgentSpec(spec).then(() => {
              setEditing(null);
            });
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function SpecForm(props: {
  spec: AgentSpec;
  onSave: (spec: AgentSpec) => void;
  onCancel: () => void;
}) {
  const [spec, setSpec] = useState(props.spec);
  const patch = (partial: Partial<AgentSpec>) => {
    setSpec((s) => ({ ...s, ...partial }));
  };

  const runnerKind = spec.runner.kind;
  const setRunner = (kind: string) => {
    const runner: RunnerKind =
      kind === "custom"
        ? { kind: "custom", command: spec.runner.kind === "custom" ? spec.runner.command : "" }
        : kind === "codex_headless"
          ? { kind: "codex_headless" }
          : { kind: "claude_headless" };
    patch({ runner });
  };

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-md border border-edge bg-ground/60 p-3 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted">name</span>
        <input
          value={spec.name}
          onChange={(e) => {
            patch({ name: e.target.value });
          }}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">runner</span>
          <select
            value={runnerKind}
            onChange={(e) => {
              setRunner(e.target.value);
            }}
            className={inputClass}
          >
            <option value="claude_headless">claude (headless)</option>
            <option value="codex_headless">codex (headless)</option>
            <option value="custom">custom command</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">model (optional)</span>
          <input
            value={spec.model ?? ""}
            onChange={(e) => {
              patch({ model: e.target.value || null });
            }}
            placeholder="default"
            className={inputClass}
          />
        </label>
      </div>

      {spec.runner.kind === "custom" ? (
        <label className="flex flex-col gap-1">
          <span className="text-muted">command (runs via sh -c; prompt arrives on stdin)</span>
          <input
            value={spec.runner.command}
            onChange={(e) => {
              patch({ runner: { kind: "custom", command: e.target.value } });
            }}
            className={`${inputClass} font-mono`}
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-muted">review instructions</span>
        <textarea
          value={spec.prompt}
          onChange={(e) => {
            patch({ prompt: e.target.value });
          }}
          className={`${inputClass} min-h-24 resize-y`}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">allowed tools (comma-separated, claude only)</span>
          <input
            value={spec.allowed_tools.join(",")}
            onChange={(e) => {
              patch({
                allowed_tools: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
            }}
            placeholder="Read,Grep,Glob"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">timeout (minutes)</span>
          <input
            type="number"
            min={1}
            value={spec.timeout_minutes}
            onChange={(e) => {
              patch({ timeout_minutes: Math.max(1, Number(e.target.value) || 15) });
            }}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-muted">
          network allowlist (one URL per line — enforced by the v2 Docker+squid sandbox, see
          docs/SANDBOXING.md)
        </span>
        <textarea
          value={spec.network_allowlist.join("\n")}
          onChange={(e) => {
            patch({ network_allowlist: e.target.value.split("\n").filter(Boolean) });
          }}
          placeholder="https://api.anthropic.com"
          className={`${inputClass} min-h-12 resize-y font-mono`}
        />
      </label>

      <div className="flex gap-2">
        <Button
          kind="primary"
          onClick={() => {
            props.onSave(spec);
          }}
          disabled={!spec.name.trim()}
        >
          save agent
        </Button>
        <Button onClick={props.onCancel}>cancel</Button>
      </div>
    </div>
  );
}
