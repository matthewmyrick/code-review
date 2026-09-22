// Tiny shared UI primitives, styled for the Tandem theme.

import { GitPullRequest, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { create } from "zustand";

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

type Tone = "sky" | "moss" | "ember" | "amber" | "muted" | "github";

const toneClasses: Record<Tone, string> = {
  sky: "bg-sky/15 text-sky",
  moss: "bg-moss/15 text-moss",
  ember: "bg-ember/15 text-ember",
  amber: "bg-amber/15 text-amber",
  muted: "bg-edge/60 text-muted",
  // High-contrast on purpose: GitHub-origin content must be unmissable.
  github: "bg-cream text-ground shadow-sm",
};

/** Tandem's mark: two chevrons riding together — the agent and you. */
export function TandemMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 5.5 12.5 12 6 18.5" opacity={0.5} />
      <path d="M12 5.5 18.5 12 12 18.5" />
    </svg>
  );
}

/** The GitHub octocat mark (inline so we stay CDN-free). */
export function GithubMark({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

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

/** Open-modal counter. Unpinned side panes normally unmount when the
 * mouse leaves; while any modal is open they must stay mounted or the
 * modal (and its draft) would vanish with them. */
export const useModalHold = create<{ count: number; inc: () => void; dec: () => void }>((set) => ({
  count: 0,
  inc: () => {
    set((s) => ({ count: s.count + 1 }));
  },
  dec: () => {
    set((s) => ({ count: Math.max(0, s.count - 1) }));
  },
}));

/** Centered floating pane over a dimmed backdrop. Closes via ✕ or
 * Escape — but never on backdrop clicks, and Esc while typing only
 * blurs the field (a second Esc closes), so a half-typed comment can't
 * be lost by a stray keypress. */
export function Modal(props: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const inc = useModalHold((s) => s.inc);
  const dec = useModalHold((s) => s.dec);
  const { onClose } = props;
  useEffect(() => {
    inc();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      dec();
      window.removeEventListener("keydown", onKey);
    };
  }, [inc, dec, onClose]);

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      {/* Percentage heights (not vh) so CSS zoom can't push the header
          and close button past the real viewport. */}
      <div className="animate-fade-up flex h-[85%] max-h-full w-[min(85%,80rem)] flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
          <div className="min-w-0 flex-1 text-xs font-medium text-cream">{props.title}</div>
          <button
            type="button"
            onClick={props.onClose}
            title="close (esc)"
            className="inline-flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-cream"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
      </div>
    </div>
  );
}
