//! Pull-request data commands: cache-first reads plus explicit syncs.
//!
//! The UI pattern is: call the `get_*` command for an instant (possibly
//! stale) render, kick off the matching `sync_*` command, and re-render
//! when it resolves. `appa://sync` events drive the loading indicators.

use appa_cache::{Cache, ReviewStore};
use appa_core::diff::FileDiff;
use appa_core::github::{PrDetail, PullRequest};
use appa_core::review::LocalComment;
use appa_core::AppaError;
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::{emit_sync, parse_repo, SyncPhase};
use crate::state::AppState;

/// Everything the PR screen needs, served from cache in one call.
#[derive(Debug, Clone, Serialize)]
pub struct PrBundle {
    pub detail: PrDetail,
    pub diff: Vec<FileDiff>,
    pub comments: Vec<LocalComment>,
}

#[tauri::command]
pub async fn get_pull_requests(
    state: State<'_, AppState>,
    repo: String,
) -> Result<Vec<PullRequest>, AppaError> {
    let repo = parse_repo(&repo)?;
    state.cache.lock().await.get_pull_requests(&repo)
}

/// One synced page of PRs plus whether another page likely exists.
#[derive(Debug, Clone, Serialize)]
pub struct PrPage {
    pub prs: Vec<PullRequest>,
    pub has_more: bool,
}

#[tauri::command]
pub async fn sync_pull_requests(
    app: AppHandle,
    state: State<'_, AppState>,
    repo: String,
    page: Option<u32>,
) -> Result<PrPage, AppaError> {
    let repo = parse_repo(&repo)?;
    let page = page.unwrap_or(1).max(1);
    let key = format!("prs:{}", repo.slug());
    emit_sync(&app, &key, SyncPhase::Started, None);

    let result = async {
        let client = state.github_client().await?;
        let prs = client.list_pull_requests(&repo, page).await?;
        let mut cache = state.cache.lock().await;
        if page == 1 {
            cache.put_pull_requests(&repo, &prs)?;
        } else {
            cache.append_pull_requests(&repo, &prs)?;
        }
        let has_more = prs.len() == appa_github::GithubClient::PR_PAGE_SIZE;
        Ok::<_, AppaError>(PrPage { prs, has_more })
    }
    .await;

    match &result {
        Ok(_) => emit_sync(&app, &key, SyncPhase::Finished, None),
        Err(e) => emit_sync(&app, &key, SyncPhase::Error, Some(e.to_string())),
    }
    result
}

#[tauri::command]
pub async fn get_pr_bundle(
    state: State<'_, AppState>,
    repo: String,
    number: u64,
) -> Result<Option<PrBundle>, AppaError> {
    let repo = parse_repo(&repo)?;
    let cache = state.cache.lock().await;
    load_bundle(&cache, &repo, number)
}

#[tauri::command]
pub async fn sync_pr_bundle(
    app: AppHandle,
    state: State<'_, AppState>,
    repo: String,
    number: u64,
) -> Result<PrBundle, AppaError> {
    let repo = parse_repo(&repo)?;
    let key = format!("pr:{}#{number}", repo.slug());
    emit_sync(&app, &key, SyncPhase::Started, None);

    let result = async {
        let client = state.github_client().await?;
        let detail = client.pull_request_detail(&repo, number).await?;
        let raw = client.pull_request_diff_raw(&repo, number).await?;
        let diff = appa_core::diff_parse::parse_unified_diff(&raw)?;

        let cache = state.cache.lock().await;
        cache.put_pr_detail(&repo, &detail)?;
        cache.put_diff(&repo, number, &detail.pull_request.head_sha, &raw, &diff)?;
        cache.touch_sync(&key)?;
        let comments = cache.list_comments(&repo, number)?;
        Ok::<_, AppaError>(PrBundle {
            detail,
            diff,
            comments,
        })
    }
    .await;

    match &result {
        Ok(_) => emit_sync(&app, &key, SyncPhase::Finished, None),
        Err(e) => emit_sync(&app, &key, SyncPhase::Error, Some(e.to_string())),
    }
    result
}

#[tauri::command]
pub async fn get_last_synced(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<DateTime<Utc>>, AppaError> {
    state.cache.lock().await.last_synced(&key)
}

fn load_bundle(
    cache: &Cache,
    repo: &appa_core::github::RepoRef,
    number: u64,
) -> Result<Option<PrBundle>, AppaError> {
    let Some(detail) = cache.get_pr_detail(repo, number)? else {
        return Ok(None);
    };
    let diff = cache
        .get_diff(repo, number, &detail.pull_request.head_sha)?
        .unwrap_or_default();
    let comments = cache.list_comments(repo, number)?;
    Ok(Some(PrBundle {
        detail,
        diff,
        comments,
    }))
}
