// App shell: header, collapsible side panes, and the main review /
// settings views. The main page is always the pull-request review view;
// settings is a secondary screen behind the gear.

import { ArrowLeft, Bot, GitPullRequest, MessageSquare, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { AgentPanel } from "./components/AgentPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffViewer } from "./components/DiffViewer";
import { FileTreePanel } from "./components/FileTree";
import { PrHeader } from "./components/PrHeader";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { SidePane } from "./components/SidePane";
import { Button, EmptyState, IconButton, TandemMark } from "./components/ui";
import { useAppStore } from "./state/store";

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const goHome = useAppStore((s) => s.goHome);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const lastError = useAppStore((s) => s.lastError);
  const clearError = useAppStore((s) => s.clearError);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-edge bg-panel px-4 py-2">
        <button
          type="button"
          onClick={goHome}
          title="back to pull requests"
          className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-panel-2"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-deep to-sky text-white shadow-sm">
            <TandemMark size={16} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-cream">Tandem</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton onClick={toggleTheme} title="toggle light/dark theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </IconButton>
          <IconButton
            onClick={() => {
              setView(view === "settings" ? "review" : "settings");
            }}
            title={view === "settings" ? "back to review" : "settings"}
          >
            {view === "settings" ? <ArrowLeft size={15} /> : <Settings size={15} />}
          </IconButton>
        </div>
      </div>

      {lastError ? (
        <div className="animate-fade-in flex items-center gap-2 border-b border-ember/40 bg-ember/10 px-4 py-1.5 text-xs text-ember">
          <span className="min-w-0 flex-1 truncate" title={lastError}>
            {lastError}
          </span>
          <Button kind="danger" onClick={clearError}>
            dismiss
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {view === "settings" ? (
          <main className="animate-fade-up flex-1 overflow-y-auto">
            <SettingsView />
          </main>
        ) : (
          <ReviewLayout />
        )}
      </div>
    </div>
  );
}

function ReviewLayout() {
  const bundle = useAppStore((s) => s.bundle);
  const selectedPr = useAppStore((s) => s.selectedPr);
  const settings = useAppStore((s) => s.settings);
  const setView = useAppStore((s) => s.setView);
  const prs = useAppStore((s) => s.prs);
  const runs = useAppStore((s) => s.runs);
  const leftPinned = useAppStore((s) => s.leftPinned);
  const rightPinned = useAppStore((s) => s.rightPinned);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const [tab, setTab] = useState<"comments" | "agents">("agents");

  const agentRunning = runs.some((r) => r.status === "starting" || r.status === "running");
  const commentCount = bundle
    ? bundle.comments.length + bundle.detail.comments.length + bundle.detail.review_bodies.length
    : 0;
  const selectedRepo = useAppStore((s) => s.selectedRepo);
  const prKey = `${selectedRepo ?? ""}#${String(selectedPr ?? "")}`;

  // First run: no repos configured yet — onboard from the main page.
  if (settings?.repos.length === 0) {
    return (
      <main className="flex-1">
        <EmptyState
          title="welcome aboard"
          hint="add a GitHub repository to start reviewing — Tandem reads PRs, checks and comments, and keeps all review notes local"
          action={
            <Button
              kind="primary"
              onClick={() => {
                setView("settings");
              }}
            >
              <Settings size={12} /> set up a repository
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <>
      <SidePane
        side="left"
        pinned={leftPinned}
        onTogglePin={() => {
          togglePinned("left");
        }}
        widthClass="w-72"
        rail={
          <>
            <GitPullRequest size={16} />
            {prs.length > 0 ? (
              <span className="rounded-full bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold text-cream">
                {prs.length}
              </span>
            ) : null}
          </>
        }
      >
        <Sidebar />
      </SidePane>

      <main className="flex min-w-0 flex-1 flex-col">
        {bundle ? (
          <>
            <PrHeader detail={bundle.detail} />
            <div className="flex min-h-0 flex-1">
              <FileTreePanel key={prKey} prKey={prKey} />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DiffViewer
                  diff={bundle.diff}
                  comments={bundle.comments}
                  githubComments={bundle.detail.comments}
                />
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title={selectedPr === null ? "pick a pull request" : "loading pull request…"}
            hint={
              selectedPr === null
                ? "select a PR from the sidebar — Tandem loads from cache instantly and syncs GitHub in the background"
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
            togglePinned("right");
          }}
          widthClass="w-80"
          rail={
            <>
              <span className="relative">
                <Bot size={16} />
                {agentRunning ? <span className="run-dot" /> : null}
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
              {(["agents", "comments"] as const).map((t) => (
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
