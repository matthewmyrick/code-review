//! Pull-request data commands: cache-first reads plus explicit syncs.
//!
//! The UI pattern is: call the `get_*` command for an instant (possibly
//! stale) render, kick off the matching `sync_*` command, and re-render
//! when it resolves. `tandem://sync` events drive the loading indicators.

use chrono::{DateTime, Utc};
use serde::Serialize;
use tandem_cache::{ArchiveStore, Cache, ReviewStore};
use tandem_core::diff::FileDiff;
use tandem_core::github::{ArchivedPr, PrDetail, PrState, PullRequest};
use tandem_core::review::LocalComment;
use tandem_core::TandemError;
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
) -> Result<Vec<PullRequest>, TandemError> {
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
) -> Result<PrPage, TandemError> {
    let repo = parse_repo(&repo)?;
    let page = page.unwrap_or(1).max(1);
    let key = format!("prs:{}", repo.slug());
    emit_sync(&app, &key, SyncPhase::Started, None);

    let result = async {
        let client = state.github_client().await?;
        let prs = client.list_pull_requests(&repo, page).await?;

        // PRs that vanished from page 1 of the open list may have merged:
        // check each and archive merged ones (3-day retention).
        let vanished: Vec<u64> = if page == 1 {
            let cache = state.cache.lock().await;
            let open: std::collections::HashSet<u64> = prs.iter().map(|p| p.number).collect();
            cache
                .get_pull_requests(&repo)?
                .iter()
                .map(|p| p.number)
                .filter(|n| !open.contains(n))
                .collect()
        } else {
            Vec::new()
        };
        for number in vanished {
            if let Ok(pr) = client.pull_request(&repo, number).await {
                if pr.state == PrState::Merged {
                    let cache = state.cache.lock().await;
                    cache.archive_pr(&pr, Utc::now())?;
                }
            }
        }

        let mut cache = state.cache.lock().await;
        if page == 1 {
            cache.put_pull_requests(&repo, &prs)?;
        } else {
            cache.append_pull_requests(&repo, &prs)?;
        }
        purge_expired_data(&mut cache, &state.dirs.runs_dir)?;
        let has_more = prs.len() == tandem_github::GithubClient::PR_PAGE_SIZE;
        Ok::<_, TandemError>(PrPage { prs, has_more })
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
) -> Result<Option<PrBundle>, TandemError> {
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
) -> Result<PrBundle, TandemError> {
    let repo = parse_repo(&repo)?;
    let key = format!("pr:{}#{number}", repo.slug());
    emit_sync(&app, &key, SyncPhase::Started, None);

    let result = async {
        let client = state.github_client().await?;
        let detail = client.pull_request_detail(&repo, number).await?;
        let raw = client.pull_request_diff_raw(&repo, number).await?;
        let diff = tandem_core::diff_parse::parse_unified_diff(&raw)?;

        let cache = state.cache.lock().await;
        cache.put_pr_detail(&repo, &detail)?;
        cache.put_diff(&repo, number, &detail.pull_request.head_sha, &raw, &diff)?;
        cache.touch_sync(&key)?;
        if detail.pull_request.state == PrState::Merged {
            cache.archive_pr(&detail.pull_request, Utc::now())?;
        }
        let comments = cache.list_comments(&repo, number)?;
        Ok::<_, TandemError>(PrBundle {
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

/// Search all open PRs server-side; results are merged into the cache
/// so they can be opened like any listed PR.
#[tauri::command]
pub async fn search_prs(
    app: AppHandle,
    state: State<'_, AppState>,
    repo: String,
    query: String,
) -> Result<Vec<PullRequest>, TandemError> {
    let repo = parse_repo(&repo)?;
    let key = format!("prs:{}", repo.slug());
    emit_sync(&app, &key, SyncPhase::Started, None);
    let result = async {
        let client = state.github_client().await?;
        let prs = client.search_open_prs(&repo, &query).await?;
        state.cache.lock().await.append_pull_requests(&repo, &prs)?;
        Ok::<_, TandemError>(prs)
    }
    .await;
    match &result {
        Ok(_) => emit_sync(&app, &key, SyncPhase::Finished, None),
        Err(e) => emit_sync(&app, &key, SyncPhase::Error, Some(e.to_string())),
    }
    result
}

/// Account-wide PR inbox: PRs across all repos where you're wanted.
#[tauri::command]
pub async fn list_my_prs(
    state: State<'_, AppState>,
    scope: String,
) -> Result<Vec<PullRequest>, TandemError> {
    let client = state.github_client().await?;
    let query = match scope.as_str() {
        "requested" => "review-requested:@me",
        "mentions" => "mentions:@me",
        "involved" => "involves:@me",
        "approved" => return client.approved_by_me().await,
        other => {
            return Err(TandemError::Config(format!("unknown inbox scope: {other}")));
        }
    };
    client.search_global_prs(query).await
}

#[tauri::command]
pub async fn list_archived_prs(
    state: State<'_, AppState>,
    repo: String,
) -> Result<Vec<ArchivedPr>, TandemError> {
    let repo = parse_repo(&repo)?;
    state.cache.lock().await.list_archived(&repo)
}

/// Purge expired archive entries and their run directories on disk.
pub(crate) fn purge_expired_data(
    cache: &mut Cache,
    runs_dir: &std::path::Path,
) -> Result<(), TandemError> {
    let log_paths = cache.purge_expired(Utc::now())?;
    for log_path in log_paths {
        let path = std::path::Path::new(&log_path);
        // Only remove directories that live under our own runs dir.
        if let Some(dir) = path.parent() {
            if dir.starts_with(runs_dir) {
                if let Err(e) = std::fs::remove_dir_all(dir) {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        tracing::warn!(dir = %dir.display(), error = %e, "failed to purge run dir");
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_last_synced(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<DateTime<Utc>>, TandemError> {
    state.cache.lock().await.last_synced(&key)
}

fn load_bundle(
    cache: &Cache,
    repo: &tandem_core::github::RepoRef,
    number: u64,
) -> Result<Option<PrBundle>, TandemError> {
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
