// App shell: header, the right-hand pane, and the main views. Review
// status is home; the pull-request review view is what opening a PR
// from it leads to, and settings sits behind the gear.

import {
  ArrowLeft,
  Bot,
  Keyboard,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

import { AgentPanel } from "./components/AgentPanel";
import { AgentsDashboard, AgentsMenuButton } from "./components/AgentsDashboard";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffViewer } from "./components/DiffViewer";
import { FileTreePanel } from "./components/FileTree";
import { NotificationsBell } from "./components/NotificationsBell";
import { PrHeader } from "./components/PrHeader";
import { ReviewStatusMenuButton, ReviewStatusView } from "./components/ReviewStatusView";
import { ShortcutManager } from "./components/ShortcutManager";
import { SummarySection } from "./components/SummarySection";
import { SettingsView } from "./components/SettingsView";
import { SidePane } from "./components/SidePane";
import { ToastHost } from "./components/ToastHost";
import { Button, EmptyState, IconButton, TandemMark } from "./components/ui";
import { UpdateButton } from "./components/UpdateButton";
import { useKeyNav } from "./state/keyNav";
import { applyZoom, loadZoom } from "./state/persist";
import { isWorking } from "./state/runBoard";
import { useAppStore } from "./state/store";

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const goHome = useAppStore((s) => s.goHome);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const [zoom, setZoom] = useState(loadZoom);
  const changeZoom = (delta: number) => {
    setZoom((z) => {
      const next = delta === 0 ? 100 : Math.min(160, Math.max(70, z + delta));
      applyZoom(next);
      return next;
    });
  };

  useEffect(() => {
    void init();
    // Bring the window to the front on startup — after an update the
    // relaunched app would otherwise reopen behind other windows.
    getCurrentWindow()
      .setFocus()
      .catch(() => undefined);
    applyZoom(loadZoom());
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        changeZoom(10);
      } else if (e.key === "-") {
        e.preventDefault();
        changeZoom(-10);
      } else if (e.key === "0") {
        e.preventDefault();
        changeZoom(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [init]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-edge bg-panel px-4 py-2">
        <button
          type="button"
          onClick={goHome}
          title="back to review status"
          className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-panel-2"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-deep to-sky text-white shadow-sm">
            <TandemMark size={16} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-cream">Tandem</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <UpdateButton />
          <ReviewStatusMenuButton />
          <AgentsMenuButton />
          <NotificationsBell />
          <IconButton onClick={toggleTheme} title="toggle light/dark theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton
            onClick={() => {
              useKeyNav.getState().setHelp(true);
            }}
            title="keyboard shortcuts (?)"
          >
            <Keyboard size={15} />
          </IconButton>
          <IconButton
            onClick={() => {
              setView(
                view === "settings"
                  ? selectedPr === null
                    ? "review-status"
                    : "review"
                  : "settings",
              );
            }}
            title={view === "settings" ? "back" : "settings"}
            active={view === "settings"}
          >
            {view === "settings" ? <ArrowLeft size={15} /> : <Settings size={15} />}
          </IconButton>
          <span className="flex items-center gap-0.5 rounded-lg bg-panel-2/60 px-1">
            <IconButton
              onClick={() => {
                changeZoom(-10);
              }}
              title="zoom out (⌘-)"
            >
              <ZoomOut size={13} />
            </IconButton>
            <button
              type="button"
              onClick={() => {
                changeZoom(0);
              }}
              title="reset zoom (⌘0)"
              className="w-9 text-center text-[10px] text-muted transition-colors hover:text-cream"
            >
              {zoom}%
            </button>
            <IconButton
              onClick={() => {
                changeZoom(10);
              }}
              title="zoom in (⌘+)"
            >
              <ZoomIn size={13} />
            </IconButton>
          </span>
        </div>
      </div>

      <ToastHost />
      <ShortcutManager />
      <div className="flex min-h-0 flex-1">
        {view === "settings" ? (
          <main className="animate-fade-up flex-1 overflow-y-scroll [scrollbar-gutter:stable]">
            <SettingsView />
          </main>
        ) : view === "agents" ? (
          <main className="animate-fade-up flex-1 overflow-y-scroll [scrollbar-gutter:stable]">
            <AgentsDashboard />
          </main>
        ) : view === "review-status" ? (
          <main className="animate-fade-up flex-1 overflow-y-scroll [scrollbar-gutter:stable]">
            <ReviewStatusView />
          </main>
        ) : (
          <ReviewLayout />
        )}
      </div>
    </div>
  );
}

/** How many agent runs are working on the open PR right now — the same
 * pulsing count the header's agents button shows, so an in-flight run
 * is just as visible from the PR's own right-hand pane. `inline` drops
 * the corner-overlay positioning for use next to a tab label. */
function WorkingBadge({ count, inline }: { count: number; inline?: boolean }) {
  return (
    <span
      className={`flex size-3.5 animate-pulse items-center justify-center rounded-full bg-sky text-[8px] font-bold text-ground ${
        inline ? "" : "absolute -right-1.5 -top-1.5"
      }`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function ReviewLayout() {
  const bundle = useAppStore((s) => s.bundle);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const settings = useAppStore((s) => s.settings);
  const setView = useAppStore((s) => s.setView);
  const runs = useAppStore((s) => s.runs);
  const rightPinned = useAppStore((s) => s.rightPinned);
  const toggleRightPane = useAppStore((s) => s.toggleRightPane);
  const [tab, setTab] = useState<"comments" | "agents">("comments");

  const agentsWorking = runs.filter(isWorking).length;
  const commentCount = bundle
    ? bundle.comments.length + bundle.detail.comments.length + bundle.detail.review_bodies.length
    : 0;
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const refreshBundle = useAppStore((s) => s.refreshBundle);
  const prKey = `${selectedRepo ?? ""}#${String(selectedPr ?? "")}`;
  const prOpen = bundle !== null;

  // While a PR is on screen, quietly poll for new comments/commits/
  // checks — the cached bundle means reopening is instant either way.
  useEffect(() => {
    if (!prOpen) return;
    const timer = setInterval(() => {
      void refreshBundle();
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, [prKey, prOpen, refreshBundle]);

  // First run: no orgs tracked yet — onboard from the main page.
  if (settings?.orgs.length === 0) {
    return (
      <main className="flex-1">
        <EmptyState
          title="welcome aboard"
          hint="track a GitHub org (or yourself) to start reviewing — Tandem reads PRs, checks and comments, and keeps all review notes local"
          action={
            <Button
              kind="primary"
              onClick={() => {
                setView("settings");
              }}
            >
              <Settings size={12} /> set up an organization
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col">
        {bundle ? (
          <>
            <PrHeader detail={bundle.detail} />
            <div className="border-b border-edge px-4 pb-2">
              <SummarySection />
            </div>
            <div className="flex min-h-0 flex-1">
              <FileTreePanel key={prKey} prKey={prKey} />
              <div id="diff-scroll" className="min-h-0 flex-1 overflow-y-auto">
                <DiffViewer
                  diff={bundle.diff}
                  comments={bundle.comments}
                  githubComments={bundle.detail.comments}
                  reviewThreads={bundle.detail.review_threads}
                />
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title={selectedPr === null ? "pick a pull request" : "loading pull request…"}
            hint={
              selectedPr === null
                ? "open one from review status (⌘K jumps to any PR) — Tandem loads from cache instantly and syncs GitHub in the background"
                : undefined
            }
          />
        )}
      </main>

      {bundle ? (
        <SidePane
          side="right"
          pinned={rightPinned}
          onTogglePin={() => {
            toggleRightPane();
          }}
          widthClass="w-80"
          rail={
            <>
              <span className="relative">
                <Bot size={16} />
                {agentsWorking > 0 ? <WorkingBadge count={agentsWorking} /> : null}
              </span>
              {commentCount > 0 ? (
                <span className="rounded-full bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold text-cream">
                  {commentCount}
                </span>
              ) : null}
            </>
          }
        >
          <div className="flex h-full flex-col">
            <div className="flex border-b border-edge">
              {(["comments", "agents"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    tab === t ? "border-b-2 border-sky text-cream" : "text-muted hover:text-cream"
                  }`}
                >
                  {t === "agents" ? <Bot size={13} /> : <MessageSquare size={13} />}
                  {t === "agents" ? "agents" : `comments (${String(commentCount)})`}
                  {t === "agents" && agentsWorking > 0 ? (
                    <WorkingBadge count={agentsWorking} inline />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "agents" ? <AgentPanel /> : <CommentsPanel />}
            </div>
          </div>
        </SidePane>
      ) : null}
    </>
  );
}
