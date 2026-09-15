// Agent panel: pick a configured agent, run it against the open PR, and
// watch its event stream live. Comments it emits land in the diff.

import { useState } from "react";

import { relativeTime } from "../lib/format";
import type { RunEvent } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, runTone, Spinner } from "./ui";

export function AgentPanel() {
  const specs = useAppStore((s) => s.agentSpecs);
  const runs = useAppStore((s) => s.runs);
  const events = useAppStore((s) => s.agentEvents);
  const startAgentReview = useAppStore((s) => s.startAgentReview);
  const cancelRun = useAppStore((s) => s.cancelRun);
  const setView = useAppStore((s) => s.setView);
  const [selected, setSelected] = useState<string>("");

  const activeRun = runs.find((r) => r.status === "starting" || r.status === "running");
  const agentName = selected || (specs[0]?.name ?? "");

  if (specs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="text-xs text-muted">
          no agents configured yet — add one in settings (claude, codex, or any custom command)
        </div>
        <Button
          kind="primary"
          onClick={() => {
            setView("settings");
          }}
        >
          open settings
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-edge p-3">
        <select
          value={agentName}
          onChange={(e) => {
            setSelected(e.target.value);
          }}
          className="flex-1 rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-xs text-cream"
        >
          {specs.map((spec) => (
            <option key={spec.name} value={spec.name}>
              {spec.name}
            </option>
          ))}
        </select>
        {activeRun ? (
          <Button
            kind="danger"
            onClick={() => {
              void cancelRun(activeRun.run_id);
            }}
          >
            cancel
          </Button>
        ) : (
          <Button
            kind="primary"
            disabled={!agentName}
            onClick={() => {
              void startAgentReview(agentName);
            }}
          >
            ▶ review
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeRun ? (
          <div className="flex items-center gap-2 border-b border-edge/60 px-3 py-2">
            <Spinner label={`${activeRun.agent_name} is reviewing…`} />
            <Pill tone="sky">{activeRun.comment_count} comments so far</Pill>
          </div>
        ) : null}

        <EventLog events={events} />

        <div className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-muted">
          past runs
        </div>
        {runs.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted">none yet</div>
        ) : (
          runs.map((run) => (
            <div
              key={run.run_id}
              className="flex items-center gap-2 border-b border-edge/40 px-3 py-2 text-xs"
            >
              <span className="text-cream">{run.agent_name}</span>
              <Pill tone={runTone(run.status)}>{run.status}</Pill>
              <span className="text-muted">{run.comment_count} 💬</span>
              <span className="ml-auto text-[11px] text-muted">{relativeTime(run.started_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EventLog({ events }: { events: RunEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="max-h-64 overflow-y-auto border-b border-edge/60 bg-ground/60 p-2 font-mono text-[11px] leading-relaxed">
      {events.slice(-100).map((event) => (
        <div key={`${event.run_id}:${String(event.seq)}`} className={eventClass(event)}>
          {renderEvent(event)}
        </div>
      ))}
    </div>
  );
}

function eventClass(event: RunEvent): string {
  switch (event.kind) {
    case "lifecycle":
      return "text-sky";
    case "comment":
      return "text-moss";
    case "runner":
      return "text-muted";
    case "raw":
      return "text-cream/70";
  }
}

function renderEvent(event: RunEvent): string {
  if (event.kind === "lifecycle" || event.kind === "comment") return event.payload;
  return event.payload.length > 200 ? `${event.payload.slice(0, 200)}…` : event.payload;
}
