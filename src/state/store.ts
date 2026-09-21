// Global app state (zustand). Components read slices; all IPC flows
// through the actions here so loading/sync state stays consistent.

import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { RunEvent, SyncEvent } from "../lib/types";
import { EMPTY_FILTERS } from "../lib/types";

import { sanitizePrSort } from "../lib/sort";
import { agentActions } from "./agentActions";
import { applyTheme, loadPinned, loadTheme, loadViewer, saveViewer } from "./persist";
import type { AppStore } from "./storeTypes";

export type { Theme, View } from "./storeTypes";

// React StrictMode double-invokes effects in dev; without this guard the
// event listeners register twice and every log line shows up duplicated.
let initStarted = false;

export const useAppStore = create<AppStore>((set, get) => {
  const fail = (e: unknown) => {
    set({ lastError: e instanceof Error ? e.message : String(e) });
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
    view: "review",
    theme: loadTheme(),
    leftPinned: loadPinned("tandem-pin-left"),
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
    lastError: null,
    prHasMore: false,
    prPage: 1,
    archivedPrs: [],
    filters: EMPTY_FILTERS,
    searchResults: null,
    inbox: {},
    prSort: "opened-desc",
    viewer: loadViewer(),
    collaborators: [],

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      applyTheme(get().theme);
      await listen<SyncEvent>("tandem://sync", (event) => {
        const { key, phase, error } = event.payload;
        set((s) => ({
          syncing: { ...s.syncing, [key]: phase === "started" },
          lastError: phase === "error" ? (error ?? "sync failed") : s.lastError,
        }));
      });
      await listen<RunEvent>("tandem://agent-event", (event) => {
        set((s) => ({ agentEvents: [...s.agentEvents.slice(-499), event.payload] }));
      });
      await listen("tandem://comments-updated", () => {
        void reloadComments().catch(console.error);
      });
      await listen("tandem://run-updated", () => {
        void reloadRuns().catch(console.error);
      });

      try {
        const settings = await ipc.getSettings();
        const agentSpecs = await ipc.listAgentSpecs();
        set({
          settings,
          agentSpecs,
          filters: settings.pr_filters,
          prSort: sanitizePrSort(settings.pr_sort),
        });
        const first = settings.inbox_all_repos ? "*" : settings.repos[0];
        if (first) await get().selectRepo(first);
        // Prefetch the review-request inbox for the tab badge (scoped
        // like the tabs); auth-dependent, so failures stay quiet.
        get().loadInbox("requested").catch(console.warn);
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

    setFilters: (patch) => {
      set((s) => ({ filters: { ...s.filters, ...patch } }));
    },

    resetFilters: () => {
      set({ filters: get().settings?.pr_filters ?? EMPTY_FILTERS, searchResults: null });
    },

    clearFilters: () => {
      set({ filters: EMPTY_FILTERS, searchResults: null });
    },

    searchPrs: async () => {
      const { selectedRepo, filters } = get();
      const query = filters.query.trim();
      if (!selectedRepo || selectedRepo === "*" || !query) return;
      try {
        set({ searchResults: await ipc.searchPrs(selectedRepo, query) });
      } catch (e) {
        fail(e);
      }
    },

    clearSearch: () => {
      set({ searchResults: null });
    },

    setPrSort: (sort) => {
      set({ prSort: sort });
    },

    loadInbox: async (scope, force) => {
      if (!force && get().inbox[scope]) return;
      try {
        const selected = get().selectedRepo;
        const repo = selected !== null && selected !== "*" ? selected : null;
        const prs = await ipc.listMyPrs(scope, repo);
        set((s) => ({ inbox: { ...s.inbox, [scope]: prs } }));
      } catch (e) {
        fail(e);
      }
    },

    openPr: async (repoSlug, number) => {
      if (get().selectedRepo !== repoSlug) {
        await get().selectRepo(repoSlug);
      }
      await get().selectPr(number);
    },

    toggleTheme: () => {
      const theme = get().theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      set({ theme });
    },

    goHome: () => {
      set({ view: "review", selectedPr: null, bundle: null });
    },

    togglePinned: (side) => {
      const key = side === "left" ? "leftPinned" : "rightPinned";
      const value = !get()[key];
      localStorage.setItem(side === "left" ? "tandem-pin-left" : "tandem-pin-right", String(value));
      set({ [key]: value } as Partial<AppStore>);
    },

    postToGithub: async (commentId) => {
      try {
        await ipc.postCommentToGithub(commentId);
        await reloadComments();
      } catch (e) {
        fail(e);
      }
    },

    approvePr: async (body) => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        await ipc.approvePr(selectedRepo, selectedPr, body);
        set({ bundle: await ipc.syncPrBundle(selectedRepo, selectedPr) });
      } catch (e) {
        fail(e);
      }
    },

    selectRepo: async (slug) => {
      set({
        selectedRepo: slug,
        selectedPr: null,
        bundle: null,
        prs: [],
        prPage: 1,
        archivedPrs: [],
        searchResults: null,
        inbox: {},
        // Re-seed per-repo view state from the saved defaults.
        filters: get().settings?.pr_filters ?? EMPTY_FILTERS,
        prSort: sanitizePrSort(get().settings?.pr_sort ?? "opened-desc"),
        collaborators: [],
      });
      // "*" = all repositories: aggregate open PRs across tracked repos;
      // inbox tabs search account-wide.
      if (slug === "*") {
        try {
          const repos = get().settings?.repos ?? [];
          const pages = await Promise.all(
            repos.map((r) => ipc.syncPullRequests(r, 1).catch(() => null)),
          );
          set({
            prs: pages.filter((p) => p !== null).flatMap((p) => p.prs),
            prHasMore: false,
            prPage: 1,
          });
        } catch (e) {
          fail(e);
        }
        return;
      }
      // People autocomplete for @mentions; quiet failure (needs perms).
      ipc
        .listCollaborators(slug)
        .then((collaborators) => {
          set({ collaborators });
        })
        .catch(console.warn);
      try {
        const cached = await ipc.getPullRequests(slug);
        set({ prs: cached, archivedPrs: await ipc.listArchivedPrs(slug) });
        const page = await ipc.syncPullRequests(slug, 1);
        set({
          prs: page.prs,
          prHasMore: page.has_more,
          prPage: 1,
          archivedPrs: await ipc.listArchivedPrs(slug),
        });
      } catch (e) {
        fail(e);
      }
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

    refreshPrs: async () => {
      const repo = get().selectedRepo;
      if (!repo) return;
      try {
        const page = await ipc.syncPullRequests(repo, 1);
        set({
          prs: page.prs,
          prHasMore: page.has_more,
          prPage: 1,
          archivedPrs: await ipc.listArchivedPrs(repo),
        });
      } catch (e) {
        fail(e);
      }
    },

    loadMorePrs: async () => {
      const { selectedRepo, prPage, prs } = get();
      if (!selectedRepo) return;
      try {
        const next = prPage + 1;
        const page = await ipc.syncPullRequests(selectedRepo, next);
        set({ prs: [...prs, ...page.prs], prHasMore: page.has_more, prPage: next });
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
      try {
        const saved = await ipc.updateSettings(settings);
        set({ settings: saved });
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

    clearError: () => {
      set({ lastError: null });
    },
  };
});
