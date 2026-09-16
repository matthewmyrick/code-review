//! Local review-comment commands. These comments live only in Tandem's
//! cache — nothing here talks to GitHub.

use tandem_cache::ReviewStore;
use tandem_core::review::{CommentStatus, LocalComment, NewLocalComment};
use tandem_core::TandemError;
use tauri::{AppHandle, Emitter, State};

use crate::commands::parse_repo;
use crate::state::AppState;

fn notify_comments_changed(app: &AppHandle, repo: &str, number: u64) {
    let payload = serde_json::json!({ "repo": repo, "number": number });
    if let Err(e) = app.emit("tandem://comments-updated", payload) {
        tracing::warn!(error = %e, "failed to emit comments-updated");
    }
}

#[tauri::command]
pub async fn list_local_comments(
    state: State<'_, AppState>,
    repo: String,
    number: u64,
) -> Result<Vec<LocalComment>, TandemError> {
    let repo = parse_repo(&repo)?;
    state.cache.lock().await.list_comments(&repo, number)
}

#[tauri::command]
pub async fn add_local_comment(
    app: AppHandle,
    state: State<'_, AppState>,
    comment: NewLocalComment,
) -> Result<LocalComment, TandemError> {
    let slug = comment.repo.slug();
    let number = comment.pr_number;
    let created = state.cache.lock().await.add_comment(comment)?;
    notify_comments_changed(&app, &slug, number);
    Ok(created)
}

#[tauri::command]
pub async fn set_comment_status(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    status: CommentStatus,
    repo: String,
    number: u64,
) -> Result<(), TandemError> {
    state.cache.lock().await.set_comment_status(&id, status)?;
    notify_comments_changed(&app, &repo, number);
    Ok(())
}

#[tauri::command]
pub async fn update_comment_body(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    body: String,
    repo: String,
    number: u64,
) -> Result<(), TandemError> {
    state.cache.lock().await.update_comment_body(&id, &body)?;
    notify_comments_changed(&app, &repo, number);
    Ok(())
}

#[tauri::command]
pub async fn delete_local_comment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    repo: String,
    number: u64,
) -> Result<(), TandemError> {
    state.cache.lock().await.delete_comment(&id)?;
    notify_comments_changed(&app, &repo, number);
    Ok(())
}
