// Global app state (zustand). Components read slices; all IPC flows
// through the actions here so loading/sync state stays consistent.

import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { InboxScope, RunEvent, SyncEvent } from "../lib/types";

import { sanitizePrSort } from "../lib/sort";
import { recordRunUpdate } from "./notifications";
import { useRunBoard } from "./runBoard";
import { pushGithubError, pushInfo } from "./toasts";
import { agentActions } from "./agentActions";
import { githubActions } from "./githubActions";
import { repoActions } from "./repoActions";
import { applyTheme, loadPinned, loadTheme, loadViewer, saveViewer } from "./persist";
import type { AppStore } from "./storeTypes";

export type { Theme, View } from "./storeTypes";

// React StrictMode double-invokes effects in dev; without this guard the
// event listeners register twice and every log line shows up duplicated.
let initStarted = false;

/** Keeps the review-status lists warm without hammering GitHub: ticks
 * on a coarse timer and on window focus, but only actually refetches
 * once `refresh_minutes` has elapsed, and never while the window is
 * hidden. Every list here is a GitHub *search*, which is the stingiest
 * rate limit on the API, so the cadence is a user setting (0 = off). */
function startAutoRefresh(get: () => AppStore) {
  const TICK_MS = 30_000;
  let last = Date.now();

  const maybeRefresh = () => {
    const minutes = get().settings?.refresh_minutes ?? 5;
    if (minutes <= 0 || document.hidden) return;
    if (Date.now() - last < minutes * 60_000) return;
    last = Date.now();
    void get().refreshInboxes();
  };

  setInterval(maybeRefresh, TICK_MS);
  window.addEventListener("focus", maybeRefresh);
}

export const useAppStore = create<AppStore>((set, get) => {
  const fail = (e: unknown) => {
    pushGithubError(e instanceof Error ? e.message : String(e));
  };

  const reloadComments = async () => {
    const { selectedRepo, selectedPr, bundle } = get();
    if (!selectedRepo || selectedPr === null || !bundle) return;
    const comments = await ipc.listLocalComments(selectedRepo, selectedPr);
    set({ bundle: { ...bundle, comments } });
  };

  const reloadRuns = async () => {
    const { selectedRepo, selectedPr } = get();
    if (!selectedRepo || selectedPr === null) return;
    set({ runs: await ipc.listAgentRuns(selectedRepo, selectedPr) });
  };

  return {
    view: "review-status",
    theme: loadTheme(),
    rightPinned: loadPinned("tandem-pin-right"),
    settings: null,
    selectedRepo: null,
    prs: [],
    selectedPr: null,
    bundle: null,
    agentSpecs: [],
    runs: [],
    agentEvents: [],
    syncing: {},
    prHasMore: false,
    prPage: 1,
    inbox: {},
    prSort: "opened-desc",
    viewer: loadViewer(),
    collaborators: [],
    allRepoProgress: null,
    orgRepos: [],
    reviewRequests: [],
    reviewRequestsSeeded: false,

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      applyTheme(get().theme);
      await listen<SyncEvent>("tandem://sync", (event) => {
        const { key, phase, error } = event.payload;
        set((s) => ({
          syncing: { ...s.syncing, [key]: phase === "started" },
        }));
        if (phase === "error") pushGithubError(error ?? "sync failed");
      });
      await listen<RunEvent>("tandem://agent-event", (event) => {
        set((s) => ({ agentEvents: [...s.agentEvents.slice(-499), event.payload] }));
      });
      await listen("tandem://comments-updated", () => {
        void reloadComments().catch(console.error);
      });
      await listen<import("../lib/types").AgentRun>("tandem://run-updated", (event) => {
        recordRunUpdate(event.payload);
        useRunBoard.getState().ingest(event.payload);
        void reloadRuns().catch(console.error);
      });
      await listen<{ run_id: string }>("tandem://run-deleted", (event) => {
        useRunBoard.getState().remove(event.payload.run_id);
        void reloadRuns().catch(console.error);
      });
      // Seed the agents dashboard + header badge with recent history.
      ipc
        .listAllAgentRuns()
        .then((runs) => {
          useRunBoard.getState().ingestMany(runs);
          // Runs the startup sweep just failed out were killed by the
          // restart that booted this very session — say so.
          const interrupted = runs.filter(
            (r) =>
              r.error?.includes("app restarted") &&
              r.finished_at !== null &&
              Date.now() - new Date(r.finished_at).getTime() < 3 * 60_000,
          ).length;
          if (interrupted > 0) {
            pushInfo(
              `${String(interrupted)} agent run${interrupted > 1 ? "s were" : " was"} interrupted by an app restart`,
            );
          }
        })
        .catch(console.warn);

      try {
        const settings = await ipc.getSettings();
        const agentSpecs = await ipc.listAgentSpecs();
        set({
          settings,
          agentSpecs,
          prSort: sanitizePrSort(settings.pr_sort),
        });
        await get().loadOrgRepos();
        const first = settings.inbox_all_repos ? "*" : settings.default_repo;
        // selectRepo() itself prefetches the review-request badge count;
        // with no repo to select yet, do it directly (auth-dependent, so
        // failures stay quiet).
        if (first) await get().selectRepo(first);
        // Account-wide review-requested feed for the "review status"
        // page — independent of the selected repo, kept warm so it's a
        // real notification source.
        get().refreshReviewRequests().catch(console.warn);
        startAutoRefresh(get);
        // Viewer login powers @mention highlighting and own-PR logic;
        // persisted so it's known instantly on every later launch.
        ipc
          .listGithubOwners()
          .then((o) => {
            saveViewer(o.viewer);
            set({ viewer: o.viewer });
          })
          .catch(console.warn);
      } catch (e) {
        fail(e);
      }
    },

    setView: (view) => {
      set({ view });
    },

    setPrSort: (sort) => {
      set({ prSort: sort });
    },

    // Account-wide, like everything else on the review-status page —
    // these lists are never scoped to the selected repo.
    loadInbox: async (scope, force) => {
      if (!force && get().inbox[scope]) return;
      try {
        // Deliberately does NOT clear the current list first: the
        // background refresh would otherwise flash a spinner over a
        // perfectly good list every few minutes.
        const prs = await ipc.listMyPrs(scope, null);
        set((s) => ({ inbox: { ...s.inbox, [scope]: prs } }));
      } catch (e) {
        fail(e);
      }
    },

    // One pass over everything the review-status page shows: the
    // review-request feed plus whichever inbox lists have been opened.
    // Sequential on purpose — these are search calls, and firing them
    // in parallel is exactly how you trip the rate limit.
    refreshInboxes: async () => {
      await get().refreshReviewRequests();
      for (const scope of Object.keys(get().inbox) as InboxScope[]) {
        if (get().inbox[scope] !== undefined) await get().loadInbox(scope, true);
      }
    },

    openPr: async (repoSlug, number) => {
      // Opening a PR always means "show the review page" — callers on
      // another view (review-status, settings, agents) shouldn't have
      // to remember to switch back themselves.
      set({ view: "review" });
      if (get().selectedRepo !== repoSlug) {
        await get().selectRepo(repoSlug, number);
      }
      await get().selectPr(number);
    },

    toggleTheme: () => {
      const theme = get().theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      set({ theme });
    },

    goHome: () => {
      // Review status is home; the open PR is dropped on the way so the
      // review view doesn't linger behind it.
      set({ view: "review-status", selectedPr: null, bundle: null });
    },

    toggleRightPane: () => {
      const value = !get().rightPinned;
      localStorage.setItem("tandem-pin-right", String(value));
      set({ rightPinned: value });
    },

    selectPr: async (number) => {
      const repo = get().selectedRepo;
      if (!repo) return;
      set({ selectedPr: number, bundle: null, agentEvents: [] });
      try {
        const cached = await ipc.getPrBundle(repo, number);
        if (cached) set({ bundle: cached });
        await reloadRuns();
        const fresh = await ipc.syncPrBundle(repo, number);
        set({ bundle: fresh });
      } catch (e) {
        fail(e);
      }
    },

    refreshBundle: async () => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        set({ bundle: await ipc.syncPrBundle(selectedRepo, selectedPr) });
      } catch (e) {
        fail(e);
      }
    },

    saveSettings: async (settings) => {
      const prevOrgs = [...(get().settings?.orgs ?? [])].sort();
      try {
        const saved = await ipc.updateSettings(settings);
        set({ settings: saved });
        if (JSON.stringify(prevOrgs) !== JSON.stringify([...saved.orgs].sort())) {
          get().loadOrgRepos().catch(console.warn);
        }
      } catch (e) {
        fail(e);
      }
    },

    addComment: async (comment) => {
      try {
        const created = await ipc.addLocalComment(comment);
        await reloadComments();
        return created;
      } catch (e) {
        fail(e);
        return null;
      }
    },

    setCommentStatus: async (id, status) => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        await ipc.setCommentStatus(id, status, selectedRepo, selectedPr);
        await reloadComments();
      } catch (e) {
        fail(e);
      }
    },

    deleteComment: async (id) => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        await ipc.deleteLocalComment(id, selectedRepo, selectedPr);
        await reloadComments();
      } catch (e) {
        fail(e);
      }
    },

    ...agentActions(set, get, fail, reloadComments, reloadRuns),
    ...githubActions(set, get, fail, reloadComments),
    ...repoActions(set, get, fail),
  };
});
