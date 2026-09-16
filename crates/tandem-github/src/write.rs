//! The write half of the GitHub client. These methods exist ONLY for
//! explicit user actions in the UI (post a chosen comment, approve a
//! PR) — agents have no path to them.

use tandem_core::github::RepoRef;
use tandem_core::{Result, TandemError};

use crate::client::{GithubClient, JSON_ACCEPT};

/// Parameters for a brand-new inline review comment.
#[derive(Debug, Clone)]
pub struct NewInlineComment<'a> {
    pub commit_id: &'a str,
    pub path: &'a str,
    pub line: u64,
    pub right_side: bool,
    pub body: &'a str,
}

impl GithubClient {
    async fn post_json(&self, path: &str, body: serde_json::Value) -> Result<serde_json::Value> {
        let url = format!("{}{path}", self.api_base);
        tracing::info!(%url, "github POST (explicit user action)");
        let resp = self
            .http
            .post(&url)
            .headers(self.headers(JSON_ACCEPT)?)
            .json(&body)
            .send()
            .await
            .map_err(|e| TandemError::GithubApi {
                status: 0,
                message: e.to_string(),
            })?;
        let status = resp.status();
        if !status.is_success() {
            let message = resp.text().await.unwrap_or_default();
            return Err(TandemError::GithubApi {
                status: status.as_u16(),
                message,
            });
        }
        resp.json().await.map_err(|e| TandemError::GithubApi {
            status: 0,
            message: format!("bad body: {e}"),
        })
    }

    fn id_of(value: &serde_json::Value) -> Result<u64> {
        value
            .get("id")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| TandemError::GithubApi {
                status: 0,
                message: "response missing id".into(),
            })
    }

    /// Post a plain PR (issue) comment. Returns the new comment id.
    pub async fn post_issue_comment(&self, repo: &RepoRef, number: u64, body: &str) -> Result<u64> {
        let path = format!(
            "/repos/{}/{}/issues/{number}/comments",
            repo.owner, repo.name
        );
        let value = self
            .post_json(&path, serde_json::json!({ "body": body }))
            .await?;
        Self::id_of(&value)
    }

    /// Reply inside an existing review-comment thread.
    pub async fn reply_to_review_comment(
        &self,
        repo: &RepoRef,
        number: u64,
        comment_id: u64,
        body: &str,
    ) -> Result<u64> {
        let path = format!(
            "/repos/{}/{}/pulls/{number}/comments/{comment_id}/replies",
            repo.owner, repo.name
        );
        let value = self
            .post_json(&path, serde_json::json!({ "body": body }))
            .await?;
        Self::id_of(&value)
    }

    /// Start a new inline review comment on a diff line.
    pub async fn create_review_comment(
        &self,
        repo: &RepoRef,
        number: u64,
        new: NewInlineComment<'_>,
    ) -> Result<u64> {
        let api_path = format!(
            "/repos/{}/{}/pulls/{number}/comments",
            repo.owner, repo.name
        );
        let value = self
            .post_json(
                &api_path,
                serde_json::json!({
                    "body": new.body,
                    "commit_id": new.commit_id,
                    "path": new.path,
                    "line": new.line,
                    "side": if new.right_side { "RIGHT" } else { "LEFT" },
                }),
            )
            .await?;
        Self::id_of(&value)
    }

    /// Approve the pull request (optionally with a review body).
    pub async fn approve_pull_request(
        &self,
        repo: &RepoRef,
        number: u64,
        body: Option<&str>,
    ) -> Result<()> {
        let path = format!("/repos/{}/{}/pulls/{number}/reviews", repo.owner, repo.name);
        let mut payload = serde_json::json!({ "event": "APPROVE" });
        if let Some(b) = body {
            payload["body"] = serde_json::Value::String(b.to_owned());
        }
        self.post_json(&path, payload).await?;
        Ok(())
    }
}

/// Minimal percent-encoding for a query-string value.
pub(crate) fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                char::from(b).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}
