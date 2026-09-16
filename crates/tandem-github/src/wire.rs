//! Wire-format structs for the GitHub REST API and their conversions
//! into `tandem-core` domain types. Kept separate so `client.rs` stays
//! focused on HTTP.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tandem_core::github::{
    CheckRun, CheckState, GithubComment, GithubReview, PrState, PullRequest, RepoRef,
    ReviewVerdict, User,
};

/// Search API response — we only need the matching PR numbers.
#[derive(Debug, Deserialize)]
pub struct WireSearch {
    #[serde(default)]
    pub items: Vec<WireSearchItem>,
}

#[derive(Debug, Deserialize)]
pub struct WireSearchItem {
    pub number: u64,
}

/// Slim repo row for the settings repo browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    pub full_name: String,
    pub private: bool,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WireUser {
    pub login: String,
    pub avatar_url: Option<String>,
}

impl From<WireUser> for User {
    fn from(w: WireUser) -> Self {
        Self {
            login: w.login,
            avatar_url: w.avatar_url,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WireBranch {
    #[serde(rename = "ref")]
    pub git_ref: String,
    pub sha: String,
}

#[derive(Debug, Deserialize)]
pub struct WireLabel {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct WirePull {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub merged_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub draft: bool,
    pub user: WireUser,
    pub head: WireBranch,
    pub base: WireBranch,
    #[serde(default)]
    pub additions: u64,
    #[serde(default)]
    pub deletions: u64,
    #[serde(default)]
    pub changed_files: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub labels: Vec<WireLabel>,
}

impl WirePull {
    pub fn into_domain(self, repo: &RepoRef) -> PullRequest {
        let state = if self.merged_at.is_some() {
            PrState::Merged
        } else if self.state == "closed" {
            PrState::Closed
        } else {
            PrState::Open
        };
        PullRequest {
            repo: repo.clone(),
            number: self.number,
            title: self.title,
            body: self.body.unwrap_or_default(),
            state,
            draft: self.draft,
            author: self.user.into(),
            head_ref: self.head.git_ref,
            head_sha: self.head.sha,
            base_ref: self.base.git_ref,
            additions: self.additions,
            deletions: self.deletions,
            changed_files: self.changed_files,
            created_at: self.created_at,
            updated_at: self.updated_at,
            labels: self.labels.into_iter().map(|l| l.name).collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WireCheckRunList {
    #[serde(default)]
    pub check_runs: Vec<WireCheckRun>,
}

#[derive(Debug, Deserialize)]
pub struct WireCheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub details_url: Option<String>,
}

impl From<WireCheckRun> for CheckRun {
    fn from(w: WireCheckRun) -> Self {
        let state = match (w.status.as_str(), w.conclusion.as_deref()) {
            (_, Some("success")) => CheckState::Success,
            (_, Some("failure" | "timed_out" | "action_required")) => CheckState::Failure,
            (_, Some("neutral")) => CheckState::Neutral,
            (_, Some("cancelled")) => CheckState::Cancelled,
            (_, Some("skipped")) => CheckState::Skipped,
            _ => CheckState::Pending,
        };
        Self {
            name: w.name,
            state,
            details_url: w.details_url,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WireReview {
    pub user: WireUser,
    pub state: String,
    pub body: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
}

impl From<WireReview> for GithubReview {
    fn from(w: WireReview) -> Self {
        let verdict = match w.state.as_str() {
            "APPROVED" => ReviewVerdict::Approved,
            "CHANGES_REQUESTED" => ReviewVerdict::ChangesRequested,
            "COMMENTED" => ReviewVerdict::Commented,
            "DISMISSED" => ReviewVerdict::Dismissed,
            _ => ReviewVerdict::Pending,
        };
        Self {
            author: w.user.into(),
            verdict,
            body: w.body.unwrap_or_default(),
            submitted_at: w.submitted_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WireComment {
    pub id: u64,
    pub user: WireUser,
    pub body: Option<String>,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub created_at: DateTime<Utc>,
}

impl From<WireComment> for GithubComment {
    fn from(w: WireComment) -> Self {
        Self {
            id: w.id,
            author: w.user.into(),
            body: w.body.unwrap_or_default(),
            path: w.path,
            line: w.line,
            created_at: w.created_at,
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn pull_state_normalization() {
        let json = r#"{
            "number": 7, "title": "t", "body": null, "state": "closed",
            "merged_at": "2026-01-02T03:04:05Z", "draft": false,
            "user": {"login": "matt", "avatar_url": null},
            "head": {"ref": "feat", "sha": "abc"},
            "base": {"ref": "main", "sha": "def"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z"
        }"#;
        let wire: WirePull = serde_json::from_str(json).unwrap();
        let repo = RepoRef::parse("o/r").unwrap();
        let pr = wire.into_domain(&repo);
        assert_eq!(pr.state, PrState::Merged);
        assert_eq!(pr.body, "");
        assert_eq!(pr.head_sha, "abc");
    }

    #[test]
    fn check_conclusion_mapping() {
        let run = WireCheckRun {
            name: "ci".into(),
            status: "completed".into(),
            conclusion: Some("timed_out".into()),
            details_url: None,
        };
        assert_eq!(CheckRun::from(run).state, CheckState::Failure);

        let pending = WireCheckRun {
            name: "ci".into(),
            status: "in_progress".into(),
            conclusion: None,
            details_url: None,
        };
        assert_eq!(CheckRun::from(pending).state, CheckState::Pending);
    }
}
