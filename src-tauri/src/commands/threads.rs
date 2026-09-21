//! Threaded discussion on a local review comment: persist your reply,
//! then (when an agent is involved) launch a run that has the whole
//! thread as context and answers back into the same thread.

use tandem_agents::context::{build_reply_prompt, ReplyContext, ThreadMessage};
use tandem_cache::ReviewStore;
use tandem_core::review::{
    CommentAuthorKind, CommentSeverity, DiffSide, LocalComment, NewLocalComment,
};
use tandem_core::TandemError;
use tauri::{AppHandle, Emitter, State};

use crate::commands::agents::launch_run;
use crate::state::AppState;

/// Add your reply to a thread, then have `agent_name` answer it.
#[tauri::command]
pub async fn reply_to_comment(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_name: String,
    comment_id: String,
    body: String,
) -> Result<String, TandemError> {
    if body.trim().is_empty() {
        return Err(TandemError::Config("reply cannot be empty".into()));
    }

    let root_id = {
        let cache = state.cache.lock().await;
        let root = resolve_root(&cache, &comment_id)?;
        cache.add_comment(NewLocalComment {
            repo: root.repo.clone(),
            pr_number: root.pr_number,
            head_sha: root.head_sha.clone(),
            path: root.path.clone(),
            side: root.side,
            line: root.line,
            end_line: root.end_line,
            body: body.clone(),
            suggestion: None,
            author_kind: CommentAuthorKind::Human,
            author_name: "you".into(),
            severity: CommentSeverity::Info,
            run_id: None,
            parent_id: Some(root.id.clone()),
            github_comment_id: None,
        })?;
        notify(&app, &root);
        root.id
    };

    launch_thread_run(app, &state, &agent_name, &root_id).await
}

/// Summon an agent into an existing thread (the @mention path) without
/// adding another human message first.
#[tauri::command]
pub async fn mention_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_name: String,
    comment_id: String,
) -> Result<String, TandemError> {
    launch_thread_run(app, &state, &agent_name, &comment_id).await
}

fn resolve_root(
    cache: &tandem_cache::Cache,
    comment_id: &str,
) -> Result<LocalComment, TandemError> {
    let comment = cache
        .get_comment(comment_id)?
        .ok_or_else(|| TandemError::Cache(format!("comment not found: {comment_id}")))?;
    Ok(match comment.parent_id.as_deref() {
        Some(pid) => cache.get_comment(pid)?.unwrap_or(comment),
        None => comment,
    })
}

fn notify(app: &AppHandle, root: &LocalComment) {
    let payload = serde_json::json!({ "repo": root.repo.slug(), "number": root.pr_number });
    if let Err(e) = app.emit("tandem://comments-updated", payload) {
        tracing::warn!(error = %e, "failed to emit comments-updated");
    }
}

/// Launch an agent run that continues the thread rooted at
/// `comment_id`'s root and replies into it.
async fn launch_thread_run(
    app: AppHandle,
    state: &AppState,
    agent_name: &str,
    comment_id: &str,
) -> Result<String, TandemError> {
    let (root, spec, pr, diff_excerpt, thread) = {
        let cache = state.cache.lock().await;
        let root = resolve_root(&cache, comment_id)?;
        let spec = cache
            .list_agent_specs()?
            .into_iter()
            .find(|s| s.name == agent_name)
            .ok_or_else(|| TandemError::Agent(format!("no agent named {agent_name}")))?;
        let detail = cache
            .get_pr_detail(&root.repo, root.pr_number)?
            .ok_or_else(|| TandemError::Agent("PR not synced yet — open it first".into()))?;
        let raw = cache
            .get_raw_diff(&root.repo, root.pr_number, &detail.pull_request.head_sha)?
            .unwrap_or_default();

        let mut thread: Vec<ThreadMessage> = Vec::new();
        // When the thread discusses a GitHub comment, lead with it so
        // the agent sees what's being talked about.
        if let Some(gh_id) = root.github_comment_id {
            if let Some(gh) = detail.comments.iter().find(|c| c.id == gh_id) {
                thread.push(ThreadMessage {
                    author: format!("{} (on github)", gh.author.login),
                    body: gh.body.clone(),
                });
            }
        }
        let mut messages: Vec<_> = cache
            .list_comments(&root.repo, root.pr_number)?
            .into_iter()
            .filter(|c| c.id == root.id || c.parent_id.as_deref() == Some(root.id.as_str()))
            .collect();
        messages.sort_by_key(|c| c.created_at);
        thread.extend(messages.into_iter().map(|c| ThreadMessage {
            author: c.author_name,
            body: c.body,
        }));

        let excerpt = extract_file_diff(&raw, &root.path);
        (root, spec, detail.pull_request, excerpt, thread)
    };

    let instructions = spec.prompt.clone();
    let pr_for_prompt = pr.clone();
    let repo = root.repo.clone();
    let side = match root.side {
        DiffSide::Old => "old".to_owned(),
        DiffSide::New => "new".to_owned(),
    };
    let target = Some(root.id.clone());
    launch_run(
        app,
        state,
        spec,
        repo,
        pr,
        "thread reply",
        target,
        move |run_id, comments_file| {
            let ctx = ReplyContext {
                run_id: run_id.to_owned(),
                comments_file: comments_file.to_owned(),
                parent_id: root.id.clone(),
                path: root.path.clone(),
                side,
                line: root.line,
                diff_text: diff_excerpt,
            };
            build_reply_prompt(&ctx, &pr_for_prompt, &thread, &instructions)
        },
    )
    .await
}

/// Pull one file's section out of a raw multi-file unified diff; falls
/// back to the whole diff when the file isn't found.
fn extract_file_diff(raw: &str, path: &str) -> String {
    let mut out = String::new();
    let mut in_file = false;
    for line in raw.lines() {
        if line.starts_with("diff --git ") {
            in_file = line.contains(&format!(" b/{path}")) || line.contains(&format!("a/{path} "));
        }
        if in_file {
            out.push_str(line);
            out.push('\n');
        }
    }
    if out.is_empty() {
        raw.to_owned()
    } else {
        out
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::extract_file_diff;

    #[test]
    fn extracts_single_file_section() {
        let raw = "diff --git a/a.rs b/a.rs\n--- a/a.rs\n+++ b/a.rs\n@@ -1 +1 @@\n-x\n+y\n\
                   diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-p\n+q\n";
        let got = extract_file_diff(raw, "b.ts");
        assert!(got.contains("+++ b/b.ts"));
        assert!(!got.contains("a.rs"));
    }

    #[test]
    fn falls_back_to_full_diff() {
        let raw = "diff --git a/a.rs b/a.rs\n+x\n";
        assert_eq!(extract_file_diff(raw, "missing.py"), raw);
    }
}
