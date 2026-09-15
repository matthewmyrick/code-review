// Agent panel: pick a configured agent, run it against the open PR, and
// watch a human-readable feed of what it's doing. Comments it emits land
// in the diff as local comments.

import {
  Bot,
  Brain,
  Check,
  Clock,
  CornerDownLeft,
  Dot,
  Flag,
  Loader,
  MessageCircle,
  MessageSquare,
  Play,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { LogIcon } from "../lib/agentEvents";
import { summarizeEvent } from "../lib/agentEvents";
import { relativeTime } from "../lib/format";
import type { RunEvent } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, runTone, Spinner } from "./ui";

const LOG_ICONS: Record<LogIcon, typeof Check> = {
  loader: Loader,
  play: Play,
  check: Check,
  x: X,
  stop: Square,
  clock: Clock,
  comment: MessageSquare,
  chat: MessageCircle,
  brain: Brain,
  wrench: Wrench,
  reply: CornerDownLeft,
  flag: Flag,
  dot: Dot,
};

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
      <div className="animate-fade-up flex flex-col items-center gap-3 p-6 text-center">
        <Bot size={26} strokeWidth={1.5} className="text-muted" />
        <div className="text-xs leading-relaxed text-muted">
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
          className="h-8 flex-1 rounded-lg border border-edge bg-panel-2 px-2 text-xs text-cream"
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
            <Square size={11} /> cancel
          </Button>
        ) : (
          <Button
            kind="primary"
            disabled={!agentName}
            onClick={() => {
              void startAgentReview(agentName);
            }}
          >
            <Play size={11} /> review
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeRun ? (
          <div className="animate-fade-in flex items-center gap-2 border-b border-edge/60 px-3 py-2.5">
            <Spinner label={`${activeRun.agent_name} is reviewing…`} />
            <span className="ml-auto">
              <Pill tone="sky">
                <MessageSquare size={11} /> {activeRun.comment_count}
              </Pill>
            </span>
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
              <span className="truncate text-cream">{run.agent_name}</span>
              <Pill tone={runTone(run.status)}>{run.status.replace("_", " ")}</Pill>
              <Pill tone="muted">
                <MessageSquare size={11} /> {run.comment_count}
              </Pill>
              <span className="ml-auto shrink-0 text-[11px] text-muted">
                {relativeTime(run.started_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EventLog({ events }: { events: RunEvent[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lines = events.flatMap((event) =>
    summarizeEvent(event).map((line, i) => ({
      key: `${event.run_id}:${String(event.seq)}:${String(i)}`,
      ...line,
    })),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (lines.length === 0) return null;
  return (
    <div
      ref={scrollRef}
      className="max-h-72 overflow-y-auto border-b border-edge/60 bg-ground/70 px-3 py-2 font-mono text-[11px] leading-relaxed"
    >
      {lines.slice(-150).map((line) => {
        const Icon = LOG_ICONS[line.icon];
        return (
          <div
            key={line.key}
            className={`animate-fade-in flex items-start gap-2 py-0.5 ${line.cls}`}
          >
            <Icon size={12} className="mt-0.5 shrink-0 opacity-80" />
            <span className="min-w-0 break-words">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}
