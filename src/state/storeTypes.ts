// The AppStore contract — state shape + actions. Implementation lives
// in store.ts; kept separate so both stay under the 400-line rule.

import type { PrSort } from "../lib/sort";
import type {
  AgentRun,
  AgentSpec,
  ArchivedPr,
  CommentStatus,
  LocalComment,
  NewLocalComment,
  PrBundle,
  InboxScope,
  PrFilters,
  PullRequest,
  RepoSummary,
  RunEvent,
  Settings,
} from "../lib/types";

export type View = "review" | "settings" | "agents" | "review-status";
export type Theme = "dark" | "light";

export interface AppStore {
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
  prHasMore: boolean;
  prPage: number;
  archivedPrs: ArchivedPr[];
  filters: PrFilters;
  searchResults: PullRequest[] | null;
  inbox: Partial<Record<InboxScope, PullRequest[]>>;
  prSort: PrSort;
  viewer: string | null;
  collaborators: string[];
  /** Set while "all repositories" is loading; cleared when it finishes
   * or a different repo is selected before it does. */
  allRepoProgress: { done: number; total: number } | null;
  /** Repos across every tracked org — feeds the repo picker and "all
   * repositories" aggregation. Refreshed on init and whenever the
   * tracked org list changes. */
  orgRepos: RepoSummary[];
  /** Account-wide (every tracked org) PRs where your review is
   * requested — independent of whatever repo happens to be selected.
   * Refreshed on init and on a standing timer; feeds the "review
   * status" page and its new-arrival toasts. */
  reviewRequests: PullRequest[];
  /** False until the first `refreshReviewRequests` completes — guards
   * against toasting for every already-pending request on startup. */
  reviewRequestsSeeded: boolean;

  init: () => Promise<void>;
  setView: (view: View) => void;
  toggleTheme: () => void;
  goHome: () => void;
  togglePinned: (side: "left" | "right") => void;
  replyToComment: (commentId: string, body: string, agentName: string) => Promise<void>;
  mentionAgent: (agentName: string, commentId: string) => Promise<void>;
  commitSuggestion: (commentId: string) => Promise<void>;
  postToGithub: (commentId: string) => Promise<void>;
  approvePr: (body: string | null) => Promise<void>;
  loadMorePrs: () => Promise<void>;
  setFilters: (patch: Partial<PrFilters>) => void;
  resetFilters: () => void;
  clearFilters: () => void;
  searchPrs: () => Promise<void>;
  clearSearch: () => void;
  loadInbox: (scope: InboxScope, force?: boolean) => Promise<void>;
  setPrSort: (sort: PrSort) => void;
  openPr: (repoSlug: string, number: number) => Promise<void>;
  selectRepo: (slug: string, presetPr?: number) => Promise<void>;
  loadOrgRepos: () => Promise<void>;
  refreshReviewRequests: () => Promise<void>;
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
}
