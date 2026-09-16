//! The ONLY commands that write to GitHub. Every one of them is behind
//! an explicit user click in the UI — agents have no path here, and the
//! agent prompt still forbids posting.

use tandem_cache::ReviewStore;
use tandem_core::review::DiffSide;
use tandem_core::TandemError;
use tandem_github::NewInlineComment;
use tauri::{AppHandle, Emitter, State};

use crate::commands::parse_repo;
use crate::state::AppState;

/// Post one local comment's body to GitHub. Routing:
/// - thread rooted on a GitHub review comment → reply in that thread
/// - anchored to a diff line → new inline review comment
/// - otherwise → plain PR comment
#[tauri::command]
pub async fn post_comment_to_github(
    app: AppHandle,
    state: State<'_, AppState>,
    comment_id: String,
) -> Result<u64, TandemError> {
    let (comment, thread_gh_id) = {
        let cache = state.cache.lock().await;
        let comment = cache
            .get_comment(&comment_id)?
            .ok_or_else(|| TandemError::Cache(format!("comment not found: {comment_id}")))?;
        if comment.posted_github_id.is_some() {
            return Err(TandemError::Config(
                "comment was already posted to GitHub".into(),
            ));
        }
        let root = match comment.parent_id.as_deref() {
            Some(pid) => cache.get_comment(pid)?,
            None => None,
        };
        // Reply target: the GitHub thread the root discusses, or the
        // review comment the root itself became when posted earlier.
        let thread_gh_id = comment
            .github_comment_id
            .or_else(|| root.as_ref().and_then(|r| r.github_comment_id))
            .or_else(|| root.as_ref().and_then(|r| r.posted_github_id));
        (comment, thread_gh_id)
    };

    let client = state.github_client().await?;
    let repo = comment.repo.clone();
    let number = comment.pr_number;

    let github_id = if let Some(thread_id) = thread_gh_id {
        client
            .reply_to_review_comment(&repo, number, thread_id, &comment.body)
            .await?
    } else if !comment.path.is_empty() && comment.line > 0 {
        client
            .create_review_comment(
                &repo,
                number,
                NewInlineComment {
                    commit_id: &comment.head_sha,
                    path: &comment.path,
                    line: comment.line,
                    right_side: comment.side == DiffSide::New,
                    body: &comment.body,
                },
            )
            .await?
    } else {
        client
            .post_issue_comment(&repo, number, &comment.body)
            .await?
    };

    {
        let cache = state.cache.lock().await;
        cache.set_comment_posted(&comment.id, github_id)?;
    }
    let payload = serde_json::json!({ "repo": repo.slug(), "number": number });
    if let Err(e) = app.emit("tandem://comments-updated", payload) {
        tracing::warn!(error = %e, "failed to emit comments-updated");
    }
    Ok(github_id)
}

/// Approve the PR on GitHub (explicit user action).
#[tauri::command]
pub async fn approve_pr(
    state: State<'_, AppState>,
    repo: String,
    number: u64,
    body: Option<String>,
) -> Result<(), TandemError> {
    let repo = parse_repo(&repo)?;
    let client = state.github_client().await?;
    client
        .approve_pull_request(
            &repo,
            number,
            body.as_deref().filter(|b| !b.trim().is_empty()),
        )
        .await
}
