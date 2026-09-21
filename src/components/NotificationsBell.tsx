// Header bell: agent-run notifications. Clicking one jumps to the PR
// and flash-highlights the thread / run it concerns.

import { Bell, Bot, Check, X } from "lucide-react";
import { useState } from "react";

import { useHighlight, useNotifications } from "../state/notifications";
import type { RunNotification } from "../state/notifications";
import { useAppStore } from "../state/store";
import { IconButton } from "./ui";

const PURPOSE_LABEL: Record<string, string> = {
  "pr review": "PR review",
  "thread reply": "thread reply",
  "conflict analysis": "conflict analysis",
};

export function NotificationsBell() {
  const items = useNotifications((s) => s.items);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const setHighlight = useHighlight((s) => s.set);
  const openPr = useAppStore((s) => s.openPr);
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => !i.read).length;

  const jump = (n: RunNotification) => {
    markRead(n.id);
    setOpen(false);
    void openPr(n.repo, n.number).then(() => {
      setHighlight(
        n.targetCommentId !== null ? { commentId: n.targetCommentId } : { runId: n.runId },
      );
    });
  };

  return (
    <span className="relative">
      <IconButton
        onClick={() => {
          setOpen((o) => !o);
        }}
        title="agent-run notifications"
      >
        <span className="relative">
          <Bell size={15} />
          {unread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-amber text-[8px] font-bold text-ground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
      </IconButton>

      {open ? (
        <div className="animate-fade-up absolute right-0 top-full z-40 mt-2 w-96 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
          <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              agent runs
            </span>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="ml-auto text-[10px] text-muted hover:text-cream"
              >
                mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted">
                no agent runs yet this session
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    jump(n);
                  }}
                  className={`flex w-full items-start gap-2 border-b border-edge/40 px-3 py-2.5 text-left transition-colors hover:bg-panel-2 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  {n.status === "succeeded" ? (
                    <Check size={13} className="mt-0.5 shrink-0 text-moss" />
                  ) : (
                    <X size={13} className="mt-0.5 shrink-0 text-ember" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs text-cream">
                      <Bot size={11} /> {n.agent}
                      <span className="text-muted">·</span>
                      <span className="text-muted">{PURPOSE_LABEL[n.purpose] ?? n.purpose}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                      {n.repo}#{n.number} · {n.status.replace("_", " ")} · click to jump
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </span>
  );
}
