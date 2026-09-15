//! Async GitHub REST client (read-only).

use appa_core::diff::FileDiff;
use appa_core::diff_parse::parse_unified_diff;
use appa_core::github::{GithubComment, PrDetail, PullRequest, RepoRef};
use appa_core::{AppaError, Result};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};

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
            .map_err(|e| AppaError::Config(format!("failed to build http client: {e}")))?;
        Ok(Self {
            http,
            api_base: config.api_base.trim_end_matches('/').to_owned(),
            token,
        })
    }

    fn headers(&self, accept: &str) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, header_value(accept)?);
        headers.insert(USER_AGENT, header_value("appa-code-review")?);
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
            .map_err(|e| AppaError::GithubApi {
                status: 0,
                message: e.to_string(),
            })?;
        let status = resp.status();
        if !status.is_success() {
            let message = resp.text().await.unwrap_or_default();
            return Err(AppaError::GithubApi {
                status: status.as_u16(),
                message,
            });
        }
        Ok(resp)
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let resp = self.get(path, JSON_ACCEPT).await?;
        resp.json::<T>().await.map_err(|e| AppaError::GithubApi {
            status: 0,
            message: format!("bad body: {e}"),
        })
    }

    /// Open PRs for a repository (most recently updated first).
    pub async fn list_pull_requests(&self, repo: &RepoRef) -> Result<Vec<PullRequest>> {
        let path = format!(
            "/repos/{}/{}/pulls?state=open&sort=updated&direction=desc&per_page=50",
            repo.owner, repo.name
        );
        let pulls: Vec<WirePull> = self.get_json(&path).await?;
        Ok(pulls.into_iter().map(|p| p.into_domain(repo)).collect())
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
        // comments (inline); Appa shows both.
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
        resp.text().await.map_err(|e| AppaError::GithubApi {
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

fn header_value(s: &str) -> Result<HeaderValue> {
    HeaderValue::from_str(s).map_err(|e| AppaError::Config(format!("bad header value: {e}")))
}
