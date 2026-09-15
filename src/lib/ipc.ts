// Typed wrappers around Tauri invoke — the only place command names and
// argument shapes appear.

import { invoke } from "@tauri-apps/api/core";

import type {
  AgentRun,
  AgentSpec,
  CommentStatus,
  LocalComment,
  NewLocalComment,
  PrBundle,
  PullRequest,
  Settings,
} from "./types";

export const ipc = {
  // pull requests
  getPullRequests: (repo: string) => invoke<PullRequest[]>("get_pull_requests", { repo }),
  syncPullRequests: (repo: string) => invoke<PullRequest[]>("sync_pull_requests", { repo }),
  getPrBundle: (repo: string, number: number) =>
    invoke<PrBundle | null>("get_pr_bundle", { repo, number }),
  syncPrBundle: (repo: string, number: number) =>
    invoke<PrBundle>("sync_pr_bundle", { repo, number }),
  getLastSynced: (key: string) => invoke<string | null>("get_last_synced", { key }),

  // local review comments
  listLocalComments: (repo: string, number: number) =>
    invoke<LocalComment[]>("list_local_comments", { repo, number }),
  addLocalComment: (comment: NewLocalComment) =>
    invoke<LocalComment>("add_local_comment", { comment }),
  setCommentStatus: (id: string, status: CommentStatus, repo: string, number: number) =>
    invoke<null>("set_comment_status", { id, status, repo, number }),
  updateCommentBody: (id: string, body: string, repo: string, number: number) =>
    invoke<null>("update_comment_body", { id, body, repo, number }),
  deleteLocalComment: (id: string, repo: string, number: number) =>
    invoke<null>("delete_local_comment", { id, repo, number }),

  // agents
  listAgentSpecs: () => invoke<AgentSpec[]>("list_agent_specs"),
  saveAgentSpec: (spec: AgentSpec) => invoke<null>("save_agent_spec", { spec }),
  deleteAgentSpec: (name: string) => invoke<null>("delete_agent_spec", { name }),
  listAgentRuns: (repo: string, number: number) =>
    invoke<AgentRun[]>("list_agent_runs", { repo, number }),
  startAgentReview: (agentName: string, repo: string, number: number) =>
    invoke<string>("start_agent_review", { agentName, repo, number }),
  cancelAgentRun: (runId: string) => invoke<null>("cancel_agent_run", { runId }),
  replyToComment: (agentName: string, commentId: string, body: string) =>
    invoke<string>("reply_to_comment", { agentName, commentId, body }),

  // settings
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
};
