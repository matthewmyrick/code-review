// Typed wrappers around Tauri invoke — the only place command names and
// argument shapes appear.

import { invoke } from "@tauri-apps/api/core";

import type {
  AgentRun,
  AgentSpec,
  AppRelease,
  ArchivedPr,
  FileConfigInfo,
  MergeOptions,
  OwnerList,
  RepoSummary,
  CommentStatus,
  LocalComment,
  NewLocalComment,
  PrBundle,
  PrPage,
  PullRequest,
  Settings,
} from "./types";

export const ipc = {
  // pull requests
  getPullRequests: (repo: string) => invoke<PullRequest[]>("get_pull_requests", { repo }),
  syncPullRequests: (repo: string, page = 1) =>
    invoke<PrPage>("sync_pull_requests", { repo, page }),
  getPrBundle: (repo: string, number: number) =>
    invoke<PrBundle | null>("get_pr_bundle", { repo, number }),
  syncPrBundle: (repo: string, number: number) =>
    invoke<PrBundle>("sync_pr_bundle", { repo, number }),
  getLastSynced: (key: string) => invoke<string | null>("get_last_synced", { key }),
  searchPrs: (repo: string, query: string) => invoke<PullRequest[]>("search_prs", { repo, query }),
  listMyPrs: (scope: string, repo: string | null) =>
    invoke<PullRequest[]>("list_my_prs", { scope, repo }),
  listArchivedPrs: (repo: string) => invoke<ArchivedPr[]>("list_archived_prs", { repo }),
  listFailingChecks: (repo: string, number: number) =>
    invoke<string[]>("list_failing_checks", { repo, number }),

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
  listAllAgentRuns: () => invoke<AgentRun[]>("list_all_agent_runs"),
  startAgentReview: (agentName: string, repo: string, number: number) =>
    invoke<string>("start_agent_review", { agentName, repo, number }),
  cancelAgentRun: (runId: string) => invoke<null>("cancel_agent_run", { runId }),
  deleteAgentRun: (runId: string) => invoke<null>("delete_agent_run", { runId }),
  replyToComment: (agentName: string, commentId: string, body: string) =>
    invoke<string>("reply_to_comment", { agentName, commentId, body }),
  mentionAgent: (agentName: string, commentId: string) =>
    invoke<string>("mention_agent", { agentName, commentId }),
  startConflictResolution: (agentName: string, repo: string, number: number) =>
    invoke<string>("start_conflict_resolution", { agentName, repo, number }),

  // explicit GitHub writes (user-triggered only)
  postCommentToGithub: (commentId: string) =>
    invoke<number>("post_comment_to_github", { commentId }),
  commitSuggestion: (commentId: string) => invoke<null>("commit_suggestion", { commentId }),
  resolveGithubThread: (threadId: string) => invoke<null>("resolve_github_thread", { threadId }),
  mergePr: (repo: string, number: number, method: string) =>
    invoke<null>("merge_pr", { repo, number, method }),
  updatePrBranch: (repo: string, number: number) =>
    invoke<null>("update_pr_branch", { repo, number }),
  repoMergeOptions: (repo: string) => invoke<MergeOptions>("repo_merge_options", { repo }),
  enableAutoMerge: (repo: string, number: number, method: string) =>
    invoke<null>("enable_auto_merge", { repo, number, method }),
  approvePr: (repo: string, number: number, body: string | null) =>
    invoke<null>("approve_pr", { repo, number, body }),
  replyOnGithub: (request: {
    repo: string;
    number: number;
    body: string;
    review_comment_id: number | null;
    path: string | null;
    line: number | null;
    side_new: boolean | null;
  }) => invoke<number>("reply_on_github", { request }),

  // text utilities
  polishText: (text: string) => invoke<string>("polish_text", { text }),

  // settings
  getSettings: () => invoke<Settings>("get_settings"),
  fileConfigInfo: () => invoke<FileConfigInfo | null>("file_config_info"),
  listGithubOwners: () => invoke<OwnerList>("list_github_owners"),
  listGithubRepos: (owner: string, isViewer: boolean) =>
    invoke<RepoSummary[]>("list_github_repos", { owner, isViewer }),
  listCollaborators: (repo: string) => invoke<string[]>("list_collaborators", { repo }),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),

  // app version management
  listAppReleases: () => invoke<AppRelease[]>("list_app_releases"),
  installAppVersion: (tag: string) => invoke<null>("install_app_version", { tag }),
};
