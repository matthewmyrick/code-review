// Agent-related store actions, split out of store.ts to honor the
// 400-line rule. Spread into the store object at creation.

import { ipc } from "../lib/ipc";
import type { AgentSpec } from "../lib/types";
import type { AppStore } from "./storeTypes";

type Set = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
type Get = () => AppStore;

export function agentActions(
  set: Set,
  get: Get,
  fail: (e: unknown) => void,
  reloadComments: () => Promise<void>,
  reloadRuns: () => Promise<void>,
) {
  return {
    saveAgentSpec: async (spec: AgentSpec) => {
      try {
        await ipc.saveAgentSpec(spec);
        set({ agentSpecs: await ipc.listAgentSpecs() });
      } catch (e) {
        fail(e);
      }
    },

    deleteAgentSpec: async (name: string) => {
      try {
        await ipc.deleteAgentSpec(name);
        set({ agentSpecs: await ipc.listAgentSpecs() });
      } catch (e) {
        fail(e);
      }
    },

    startAgentReview: async (agentName: string) => {
      const { selectedRepo, selectedPr } = get();
      if (!selectedRepo || selectedPr === null) return;
      try {
        await ipc.startAgentReview(agentName, selectedRepo, selectedPr);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    cancelRun: async (runId: string) => {
      try {
        await ipc.cancelAgentRun(runId);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    replyToComment: async (commentId: string, body: string, agentName: string) => {
      try {
        await ipc.replyToComment(agentName, commentId, body);
        await reloadComments();
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },

    commitSuggestion: async (commentId: string) => {
      try {
        await ipc.commitSuggestion(commentId);
        await reloadComments();
        // The branch advanced; pull the new head + diff.
        await get().refreshBundle();
      } catch (e) {
        fail(e);
      }
    },

    mentionAgent: async (agentName: string, commentId: string) => {
      try {
        await ipc.mentionAgent(agentName, commentId);
        await reloadRuns();
      } catch (e) {
        fail(e);
      }
    },
  };
}
