// Global app state (zustand). Components read slices; all IPC flows
// through the actions here so loading/sync state stays consistent.

import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type {
  AgentRun,
  AgentSpec,
  CommentStatus,
  LocalComment,
  NewLocalComment,
  PrBundle,
  PullRequest,
  RunEvent,
  Settings,
  SyncEvent,
} from "../lib/types";

export type View = "review" | "settings";
export type Theme = "dark" | "light";

const THEME_KEY = "appa-theme";

function loadTheme(): Theme {
  // Light is the default; dark only when explicitly chosen.
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

function loadPinned(key: string): boolean {
  return localStorage.getItem(key) !== "false";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

// React StrictMode double-invokes effects in dev; without this guard the
// event listeners register twice and every log line shows up duplicated.
let initStarted = false;

interface AppStore {
  view: View;
  theme: Theme;
  leftPinned: boolean;
  rightPinned: boolean;
  settings: Settings | null;
  selectedRepo: string | null;
  prs: PullRequest[];
  selectedPr: number | null;
  bundle: PrBundle | null;
  agentSpecs: AgentSpec[];
  runs: AgentRun[];
  agentEvents: RunEvent[];
  syncing: Record<string, boolean>;
  lastError: string | null;
  prHasMore: boolean;
  prPage: number;

  init: () => Promise<void>;
  setView: (view: View) => void;
  toggleTheme: () => void;
  goHome: () => void;
  togglePinned: (side: "left" | "right") => void;
  replyToComment: (commentId: string, body: string, agentName: string) => Promise<void>;
  mentionAgent: (agentName: string, commentId: string) => Promise<void>;
  postToGithub: (commentId: string) => Promise<void>;
  approvePr: (body: string | null) => Promise<void>;
  loadMorePrs: () => Promise<void>;
  selectRepo: (slug: string) => Promise<void>;
  selectPr: (number: number) => Promise<void>;
  refreshPrs: () => Promise<void>;
  refreshBundle: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  addComment: (comment: NewLocalComment) => Promise<LocalComment | null>;
  setCommentStatus: (id: string, status: CommentStatus) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  saveAgentSpec: (spec: AgentSpec) => Promise<void>;
  deleteAgentSpec: (name: string) => Promise<void>;
  startAgentReview: (agentName: string) => Promise<void>;
  cancelRun: (runId: string) => Promise<void>;
  clearError: () => void;
}

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
    leftPinned: loadPinned("appa-pin-left"),
    rightPinned: loadPinned("appa-pin-right"),
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

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      applyTheme(get().theme);
      await listen<SyncEvent>("appa://sync", (event) => {
        const { key, phase, error } = event.payload;
        set((s) => ({
          syncing: { ...s.syncing, [key]: phase === "started" },
          lastError: phase === "error" ? (error ?? "sync failed") : s.lastError,
        }));
      });
      await listen<RunEvent>("appa://agent-event", (event) => {
        set((s) => ({ agentEvents: [...s.agentEvents.slice(-499), event.payload] }));
      });
      await listen("appa://comments-updated", () => {
        void reloadComments().catch(console.error);
      });
      await listen("appa://run-updated", () => {
        void reloadRuns().catch(console.error);
      });

      try {
        const settings = await ipc.getSettings();
        const agentSpecs = await ipc.listAgentSpecs();
        set({ settings, agentSpecs });
        const first = settings.repos[0];
        if (first) await get().selectRepo(first);
      } catch (e) {
        fail(e);
      }
    },

    setView: (view) => {
      set({ view });
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
      localStorage.setItem(side === "left" ? "appa-pin-left" : "appa-pin-right", String(value));
      set({ [key]: value } as Partial<AppStore>);
    },

    replyToComment: async (commentId, body, agentName) => {
      try {
        await ipc.replyToComment(agentName, commentId, body);
        await reloadComments();
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    mentionAgent: async (agentName, commentId) => {
      try {
        await ipc.mentionAgent(agentName, commentId);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
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
      set({ selectedRepo: slug, selectedPr: null, bundle: null, prs: [], prPage: 1 });
      try {
        const cached = await ipc.getPullRequests(slug);
        set({ prs: cached });
        const page = await ipc.syncPullRequests(slug, 1);
        set({ prs: page.prs, prHasMore: page.has_more, prPage: 1 });
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
        set({ prs: page.prs, prHasMore: page.has_more, prPage: 1 });
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

    saveAgentSpec: async (spec) => {
      try {
        await ipc.saveAgentSpec(spec);
        set({ agentSpecs: await ipc.listAgentSpecs() });
      } catch (e) {
        fail(e);
      }
    },

    deleteAgentSpec: async (name) => {
      try {
        await ipc.deleteAgentSpec(name);
        set({ agentSpecs: await ipc.listAgentSpecs() });
      } catch (e) {
        fail(e);
      }
    },

    startAgentReview: async (agentName) => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        set({ agentEvents: [] });
        await ipc.startAgentReview(agentName, selectedRepo, selectedPr);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    cancelRun: async (runId) => {
      try {
        await ipc.cancelAgentRun(runId);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    clearError: () => {
      set({ lastError: null });
    },
  };
});
