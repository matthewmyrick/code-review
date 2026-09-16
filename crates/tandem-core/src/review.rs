//! Local review state: comments written by you or an agent that live in
//! Tandem's cache and are NEVER posted to GitHub.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::github::RepoRef;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommentAuthorKind {
    Human,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommentStatus {
    /// Freshly written, awaiting your triage.
    Open,
    /// You agreed with the comment.
    Accepted,
    /// You rejected the comment (kept for the record).
    Rejected,
    /// Addressed / no longer relevant.
    Resolved,
    /// Kept for the record but hidden from the active review.
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommentSeverity {
    Info,
    Suggestion,
    Issue,
    Blocker,
}

/// Which side of the diff the comment anchors to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffSide {
    Old,
    New,
}

/// A local-only review comment, anchored to a line in a PR diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalComment {
    /// UUID string assigned by the cache layer.
    pub id: String,
    pub repo: RepoRef,
    pub pr_number: u64,
    /// Head SHA the comment was written against (comments can go stale).
    pub head_sha: String,
    pub path: String,
    pub side: DiffSide,
    pub line: u64,
    /// Inclusive end of a multi-line anchor ("lines 2-5"); None for a
    /// single line.
    #[serde(default)]
    pub end_line: Option<u64>,
    pub body: String,
    pub author_kind: CommentAuthorKind,
    /// Human username or agent name (e.g. "claude", "codex").
    pub author_name: String,
    pub severity: CommentSeverity,
    pub status: CommentStatus,
    /// Agent run that produced this comment, if any.
    pub run_id: Option<String>,
    /// Root comment this replies to; None for top-level comments.
    #[serde(default)]
    pub parent_id: Option<String>,
    /// GitHub review-comment id this thread discusses, when the thread
    /// was started from a GitHub comment.
    #[serde(default)]
    pub github_comment_id: Option<u64>,
    /// Set once this comment's body has been posted to GitHub (the id
    /// GitHub assigned). Posting is always an explicit user action.
    #[serde(default)]
    pub posted_github_id: Option<u64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Fields callers provide when creating a comment; the cache layer fills
/// in id and timestamps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewLocalComment {
    pub repo: RepoRef,
    pub pr_number: u64,
    pub head_sha: String,
    pub path: String,
    pub side: DiffSide,
    pub line: u64,
    #[serde(default)]
    pub end_line: Option<u64>,
    pub body: String,
    pub author_kind: CommentAuthorKind,
    pub author_name: String,
    pub severity: CommentSeverity,
    pub run_id: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub github_comment_id: Option<u64>,
}
