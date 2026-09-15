// Tiny shared UI primitives, styled for the Appa theme.

import { GitPullRequest } from "lucide-react";
import type { ReactNode } from "react";

import type { CheckState, CommentSeverity, RunStatus } from "../lib/types";

export function Pill(props: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-medium leading-none ${toneClasses[props.tone]}`}
    >
      {props.children}
    </span>
  );
}

type Tone = "sky" | "moss" | "ember" | "amber" | "muted";

const toneClasses: Record<Tone, string> = {
  sky: "bg-sky/15 text-sky",
  moss: "bg-moss/15 text-moss",
  ember: "bg-ember/15 text-ember",
  amber: "bg-amber/15 text-amber",
  muted: "bg-edge/60 text-muted",
};

export function checkTone(state: CheckState): Tone {
  switch (state) {
    case "success":
      return "moss";
    case "failure":
      return "ember";
    case "pending":
      return "amber";
    case "neutral":
    case "cancelled":
    case "skipped":
      return "muted";
  }
}

export function severityTone(severity: CommentSeverity): Tone {
  switch (severity) {
    case "blocker":
      return "ember";
    case "issue":
      return "amber";
    case "suggestion":
      return "sky";
    case "info":
      return "muted";
  }
}

export function runTone(status: RunStatus): Tone {
  switch (status) {
    case "succeeded":
      return "moss";
    case "failed":
    case "timed_out":
      return "ember";
    case "cancelled":
      return "muted";
    case "starting":
    case "running":
      return "sky";
  }
}

export function Button(props: {
  onClick: () => void;
  children: ReactNode;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  const kind = props.kind ?? "ghost";
  const base =
    "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none";
  const styles = {
    primary: "bg-sky-deep text-white shadow-sm shadow-sky-deep/30 hover:bg-sky hover:shadow-md",
    ghost: "bg-panel-2 text-cream ring-1 ring-edge/60 hover:bg-edge/70",
    danger: "bg-ember/15 text-ember ring-1 ring-ember/25 hover:bg-ember/25",
  }[kind];
  return (
    <button
      type="button"
      className={`${base} ${styles}`}
      onClick={props.onClick}
      disabled={props.disabled ?? false}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export function IconButton(props: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className="inline-flex size-8 items-center justify-center rounded-lg text-sm text-muted ring-1 ring-transparent transition-all duration-150 hover:bg-panel-2 hover:text-cream hover:ring-edge/60 active:scale-95"
    >
      {props.children}
    </button>
  );
}

export function Spinner(props: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="size-3 animate-spin rounded-full border-2 border-edge border-t-sky" />
      {props.label}
    </span>
  );
}

export function EmptyState(props: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="animate-fade-up flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-panel-2 text-muted shadow-sm">
        {props.icon ?? <GitPullRequest size={26} strokeWidth={1.5} />}
      </span>
      <div className="text-sm font-semibold text-cream">{props.title}</div>
      {props.hint ? (
        <div className="max-w-sm text-xs leading-relaxed text-muted">{props.hint}</div>
      ) : null}
      {props.action ?? null}
    </div>
  );
}

export function Skeleton(props: { className?: string }) {
  return <div className={`skeleton ${props.className ?? ""}`} />;
}
