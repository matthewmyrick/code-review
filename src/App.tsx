// App shell: header, sidebar, and the main review / settings views.

import { useEffect, useState } from "react";

import { AgentPanel } from "./components/AgentPanel";
import { CommentsPanel } from "./components/comments";
import { DiffViewer } from "./components/DiffViewer";
import { PrHeader } from "./components/PrHeader";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { Button, EmptyState } from "./components/ui";
import { useAppStore } from "./state/store";

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const lastError = useAppStore((s) => s.lastError);
  const clearError = useAppStore((s) => s.clearError);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-edge bg-panel px-4 py-2">
        <span className="text-base">🦬</span>
        <span className="text-sm font-semibold tracking-wide text-cream">Appa</span>
        <span className="text-[11px] text-muted">local-first code review</span>
        <div className="ml-auto">
          <Button
            onClick={() => {
              setView(view === "settings" ? "review" : "settings");
            }}
          >
            {view === "settings" ? "← back to review" : "⚙ settings"}
          </Button>
        </div>
      </div>

      {lastError ? (
        <div className="flex items-center gap-2 border-b border-ember/40 bg-ember/10 px-4 py-1.5 text-xs text-ember">
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
          <main className="flex-1 overflow-y-auto">
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
  const [tab, setTab] = useState<"comments" | "agents">("agents");

  return (
    <>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {bundle ? (
          <>
            <PrHeader detail={bundle.detail} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DiffViewer diff={bundle.diff} comments={bundle.comments} />
            </div>
          </>
        ) : (
          <EmptyState
            title={selectedPr === null ? "pick a pull request" : "loading pull request…"}
            hint={
              selectedPr === null
                ? "select a PR from the sidebar — Appa loads from cache instantly and syncs GitHub in the background"
                : undefined
            }
          />
        )}
      </main>

      {bundle ? (
        <aside className="flex w-80 shrink-0 flex-col border-l border-edge bg-panel">
          <div className="flex border-b border-edge">
            {(["agents", "comments"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                }}
                className={`flex-1 px-3 py-2 text-xs font-medium ${
                  tab === t ? "border-b-2 border-sky text-cream" : "text-muted hover:text-cream"
                }`}
              >
                {t === "agents" ? "🤖 agents" : `💬 comments (${String(bundle.comments.length)})`}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "agents" ? <AgentPanel /> : <CommentsPanel />}
          </div>
        </aside>
      ) : null}
    </>
  );
}
