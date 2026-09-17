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
  RunEvent,
  Settings,
} from "../lib/types";

export type View = "review" | "settings";
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
  lastError: string | null;
  prHasMore: boolean;
  prPage: number;
  archivedPrs: ArchivedPr[];
  filters: PrFilters;
  searchResults: PullRequest[] | null;
  inbox: Partial<Record<InboxScope, PullRequest[]>>;
  prSort: PrSort;
  inboxAllRepos: boolean;

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
  setFilters: (patch: Partial<PrFilters>) => void;
  resetFilters: () => void;
  clearFilters: () => void;
  searchPrs: () => Promise<void>;
  clearSearch: () => void;
  loadInbox: (scope: InboxScope, force?: boolean) => Promise<void>;
  setPrSort: (sort: PrSort) => void;
  toggleInboxAllRepos: () => void;
  openPr: (repoSlug: string, number: number) => Promise<void>;
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
