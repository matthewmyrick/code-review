//! GitHub-facing domain types, normalized from the REST API.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// `owner/name` reference to a repository.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RepoRef {
    pub owner: String,
    pub name: String,
}

impl RepoRef {
    /// Parse `owner/name`. Returns `None` for anything else.
    pub fn parse(s: &str) -> Option<Self> {
        let (owner, name) = s.split_once('/')?;
        if owner.is_empty() || name.is_empty() || name.contains('/') {
            return None;
        }
        Some(Self {
            owner: owner.to_owned(),
            name: name.to_owned(),
        })
    }

    pub fn slug(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub repo: RepoRef,
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: PrState,
    pub draft: bool,
    pub author: User,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub labels: Vec<String>,
}

/// Combined commit status / check-run conclusion, normalized.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckState {
    Pending,
    Success,
    Failure,
    Neutral,
    Cancelled,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckRun {
    pub name: String,
    pub state: CheckState,
    pub details_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewVerdict {
    Approved,
    ChangesRequested,
    Commented,
    Dismissed,
    Pending,
}

/// A review submitted on GitHub (approval, change request, …).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubReview {
    pub author: User,
    pub verdict: ReviewVerdict,
    pub body: String,
    pub submitted_at: Option<DateTime<Utc>>,
}

/// An issue or review comment that already exists on GitHub (read-only in
/// Tandem — we never post back).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubComment {
    pub id: u64,
    pub author: User,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub created_at: DateTime<Utc>,
}

/// A merged PR held in the archive before its data is purged.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchivedPr {
    pub pull_request: PullRequest,
    pub archived_at: DateTime<Utc>,
    /// Hard purge deadline: 11:59:59 PM EST on the third day after
    /// archival. All cached data for the PR is deleted after this.
    pub purge_after: DateTime<Utc>,
}

/// Everything Tandem knows about one PR, bundled for the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrDetail {
    pub pull_request: PullRequest,
    pub checks: Vec<CheckRun>,
    pub reviews: Vec<GithubReview>,
    pub comments: Vec<GithubComment>,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::RepoRef;

    #[test]
    fn parses_owner_name() {
        let r = RepoRef::parse("modem-dev/hunk").unwrap();
        assert_eq!(r.owner, "modem-dev");
        assert_eq!(r.name, "hunk");
        assert_eq!(r.slug(), "modem-dev/hunk");
    }

    #[test]
    fn rejects_bad_slugs() {
        assert!(RepoRef::parse("nope").is_none());
        assert!(RepoRef::parse("/name").is_none());
        assert!(RepoRef::parse("owner/").is_none());
        assert!(RepoRef::parse("a/b/c").is_none());
    }
}
