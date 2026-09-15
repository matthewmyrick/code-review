// Tiny shared UI primitives, styled for the Appa theme.

import type { ReactNode } from "react";

import type { CheckState, CommentSeverity, RunStatus } from "../lib/types";

export function Pill(props: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClasses[props.tone]}`}
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
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none";
  const styles = {
    primary: "bg-sky-deep text-cream hover:bg-sky",
    ghost: "bg-panel-2 text-cream hover:bg-edge",
    danger: "bg-ember/20 text-ember hover:bg-ember/30",
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

export function Spinner(props: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="size-3 animate-spin rounded-full border-2 border-edge border-t-sky" />
      {props.label}
    </span>
  );
}

export function EmptyState(props: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-4xl">🦬</div>
      <div className="text-sm font-medium text-cream">{props.title}</div>
      {props.hint ? <div className="max-w-sm text-xs text-muted">{props.hint}</div> : null}
    </div>
  );
}
