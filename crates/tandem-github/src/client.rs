//! Async GitHub REST client.
//!
//! Reads are Tandem's bread and butter. The handful of write methods at
//! the bottom (post comment / reply / approve) exist ONLY for explicit
//! user actions in the UI — agents have no path to them.

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use tandem_core::diff::FileDiff;
use tandem_core::diff_parse::parse_unified_diff;
use tandem_core::github::{GithubComment, PrDetail, PullRequest, RepoRef};
use tandem_core::{Result, TandemError};

use crate::auth::GithubConfig;
use crate::wire::{WireCheckRunList, WireComment, WirePull, WireReview};

const JSON_ACCEPT: &str = "application/vnd.github+json";
const DIFF_ACCEPT: &str = "application/vnd.github.v3.diff";

#[derive(Debug, Clone)]
pub struct GithubClient {
    http: reqwest::Client,
    api_base: String,
    token: Option<String>,
}

impl GithubClient {
    /// Build a client, resolving the configured auth strategy up front so
    /// auth failures surface immediately (and loudly) rather than as
    /// mysterious 401s later.
    pub async fn connect(config: &GithubConfig) -> Result<Self> {
        let token = config.auth.resolve_token().await?;
        let http = reqwest::Client::builder()
            .build()
            .map_err(|e| TandemError::Config(format!("failed to build http client: {e}")))?;
        Ok(Self {
            http,
            api_base: config.api_base.trim_end_matches('/').to_owned(),
            token,
        })
    }

    fn headers(&self, accept: &str) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, header_value(accept)?);
        headers.insert(USER_AGENT, header_value("tandem-code-review")?);
        headers.insert("X-GitHub-Api-Version", header_value("2022-11-28")?);
        if let Some(token) = &self.token {
            headers.insert(AUTHORIZATION, header_value(&format!("Bearer {token}"))?);
        }
        Ok(headers)
    }

    async fn get(&self, path: &str, accept: &str) -> Result<reqwest::Response> {
        let url = format!("{}{path}", self.api_base);
        tracing::debug!(%url, "github GET");
        let resp = self
            .http
            .get(&url)
            .headers(self.headers(accept)?)
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
        Ok(resp)
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let resp = self.get(path, JSON_ACCEPT).await?;
        resp.json::<T>().await.map_err(|e| TandemError::GithubApi {
            status: 0,
            message: format!("bad body: {e}"),
        })
    }

    /// Page size for PR listings; also how the UI decides "has more".
    pub const PR_PAGE_SIZE: usize = 30;

    /// One page of open PRs (most recently updated first), 1-indexed.
    ///
    /// The list endpoint omits `additions`/`deletions`/`changed_files`,
    /// so each PR is re-fetched individually (concurrently) to fill the
    /// size stats the sidebar shows.
    pub async fn list_pull_requests(&self, repo: &RepoRef, page: u32) -> Result<Vec<PullRequest>> {
        let path = format!(
            "/repos/{}/{}/pulls?state=open&sort=updated&direction=desc&per_page={}&page={}",
            repo.owner,
            repo.name,
            Self::PR_PAGE_SIZE,
            page.max(1)
        );
        let pulls: Vec<WirePull> = self.get_json(&path).await?;
        let mut prs: Vec<PullRequest> = pulls.into_iter().map(|p| p.into_domain(repo)).collect();

        let mut set = tokio::task::JoinSet::new();
        for (index, pr) in prs.iter().enumerate() {
            let client = self.clone();
            let owner = repo.owner.clone();
            let name = repo.name.clone();
            let number = pr.number;
            set.spawn(async move {
                let detail: Result<WirePull> = client
                    .get_json(&format!("/repos/{owner}/{name}/pulls/{number}"))
                    .await;
                (index, detail)
            });
        }
        while let Some(joined) = set.join_next().await {
            let Ok((index, Ok(detail))) = joined else {
                // A single failed enrichment shouldn't sink the list;
                // that PR just keeps zeroed stats until opened.
                continue;
            };
            if let Some(pr) = prs.get_mut(index) {
                pr.additions = detail.additions;
                pr.deletions = detail.deletions;
                pr.changed_files = detail.changed_files;
            }
        }
        Ok(prs)
    }

    /// One PR's core data (cheap single call — used for merge checks).
    pub async fn pull_request(&self, repo: &RepoRef, number: u64) -> Result<PullRequest> {
        let pull: WirePull = self
            .get_json(&format!(
                "/repos/{}/{}/pulls/{number}",
                repo.owner, repo.name
            ))
            .await?;
        Ok(pull.into_domain(repo))
    }

    /// Full detail bundle: PR, checks, reviews, and all comments.
    pub async fn pull_request_detail(&self, repo: &RepoRef, number: u64) -> Result<PrDetail> {
        let base = format!("/repos/{}/{}", repo.owner, repo.name);

        let pull: WirePull = self.get_json(&format!("{base}/pulls/{number}")).await?;
        let pull_request = pull.into_domain(repo);

        let checks: WireCheckRunList = self
            .get_json(&format!(
                "{base}/commits/{}/check-runs?per_page=100",
                pull_request.head_sha
            ))
            .await?;
        let reviews: Vec<WireReview> = self
            .get_json(&format!("{base}/pulls/{number}/reviews?per_page=100"))
            .await?;

        // GitHub splits discussion into issue comments (thread) and review
        // comments (inline); Tandem shows both.
        let issue_comments: Vec<WireComment> = self
            .get_json(&format!("{base}/issues/{number}/comments?per_page=100"))
            .await?;
        let review_comments: Vec<WireComment> = self
            .get_json(&format!("{base}/pulls/{number}/comments?per_page=100"))
            .await?;

        let mut comments: Vec<GithubComment> = issue_comments.into_iter().map(Into::into).collect();
        comments.extend(review_comments.into_iter().map(GithubComment::from));
        comments.sort_by_key(|c| c.created_at);

        Ok(PrDetail {
            pull_request,
            checks: checks.check_runs.into_iter().map(Into::into).collect(),
            reviews: reviews.into_iter().map(Into::into).collect(),
            comments,
        })
    }

    /// The PR's raw unified diff text (callers parse and/or cache it).
    pub async fn pull_request_diff_raw(&self, repo: &RepoRef, number: u64) -> Result<String> {
        let path = format!("/repos/{}/{}/pulls/{number}", repo.owner, repo.name);
        let resp = self.get(&path, DIFF_ACCEPT).await?;
        resp.text().await.map_err(|e| TandemError::GithubApi {
            status: 0,
            message: format!("bad body: {e}"),
        })
    }

    /// Convenience: the diff parsed into structured files.
    pub async fn pull_request_diff(&self, repo: &RepoRef, number: u64) -> Result<Vec<FileDiff>> {
        let raw = self.pull_request_diff_raw(repo, number).await?;
        parse_unified_diff(&raw)
    }
}

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

fn header_value(s: &str) -> Result<HeaderValue> {
    HeaderValue::from_str(s).map_err(|e| TandemError::Config(format!("bad header value: {e}")))
}
