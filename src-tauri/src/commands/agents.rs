//! Agent commands: manage specs, start/cancel review runs, and pump run
//! events into the cache and the UI.

use appa_agents::context::{build_prompt, ReviewContext};
use appa_agents::events::parse_comment;
use appa_agents::runner::{LocalProcessRunner, RunRequest};
use appa_cache::ReviewStore;
use appa_core::agent::{AgentRun, AgentSpec, RunEvent, RunEventKind, RunStatus};
use appa_core::github::RepoRef;
use appa_core::review::{CommentAuthorKind, CommentSeverity, DiffSide, NewLocalComment};
use appa_core::AppaError;
use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::parse_repo;
use crate::state::AppState;

#[tauri::command]
pub async fn list_agent_specs(state: State<'_, AppState>) -> Result<Vec<AgentSpec>, AppaError> {
    state.cache.lock().await.list_agent_specs()
}

#[tauri::command]
pub async fn save_agent_spec(state: State<'_, AppState>, spec: AgentSpec) -> Result<(), AppaError> {
    if spec.name.trim().is_empty() {
        return Err(AppaError::Config("agent name cannot be empty".into()));
    }
    state.cache.lock().await.put_agent_spec(&spec)
}

#[tauri::command]
pub async fn delete_agent_spec(state: State<'_, AppState>, name: String) -> Result<(), AppaError> {
    state.cache.lock().await.delete_agent_spec(&name)
}

#[tauri::command]
pub async fn list_agent_runs(
    state: State<'_, AppState>,
    repo: String,
    number: u64,
) -> Result<Vec<AgentRun>, AppaError> {
    let repo = parse_repo(&repo)?;
    state.cache.lock().await.list_agent_runs(&repo, number)
}

#[tauri::command]
pub async fn cancel_agent_run(state: State<'_, AppState>, run_id: String) -> Result<(), AppaError> {
    if let Some(mut handle) = state.runs.lock().await.remove(&run_id) {
        handle.cancel();
    }
    Ok(())
}

/// Start an agent review of a PR. The PR bundle must be synced first so
/// its diff is in the cache. Returns the run id; progress streams via
/// `appa://agent-event` and comments land via `appa://comments-updated`.
#[tauri::command]
pub async fn start_agent_review(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_name: String,
    repo: String,
    number: u64,
) -> Result<String, AppaError> {
    let repo = parse_repo(&repo)?;
    let (spec, pr, raw_diff) = {
        let cache = state.cache.lock().await;
        let spec = cache
            .list_agent_specs()?
            .into_iter()
            .find(|s| s.name == agent_name)
            .ok_or_else(|| AppaError::Agent(format!("no agent named {agent_name}")))?;
        let detail = cache
            .get_pr_detail(&repo, number)?
            .ok_or_else(|| AppaError::Agent("PR not synced yet — open it first".into()))?;
        let raw = cache
            .get_raw_diff(&repo, number, &detail.pull_request.head_sha)?
            .ok_or_else(|| AppaError::Agent("diff not cached yet — open the PR first".into()))?;
        (spec, detail.pull_request, raw)
    };

    let instructions = spec.prompt.clone();
    let pr_for_prompt = pr.clone();
    launch_run(app, &state, spec, repo, pr, move |run_id, comments_file| {
        let ctx = ReviewContext {
            run_id: run_id.to_owned(),
            comments_file: comments_file.to_owned(),
            diff_text: raw_diff,
        };
        build_prompt(&ctx, &pr_for_prompt, &instructions)
    })
    .await
}

/// Shared launch path for every agent run (fresh review or thread
/// reply): create the run dir, spawn the process, persist the run row,
/// stash the cancel handle, and start the event pump.
pub(crate) async fn launch_run(
    app: AppHandle,
    state: &AppState,
    spec: AgentSpec,
    repo: RepoRef,
    pr: appa_core::github::PullRequest,
    build_prompt_fn: impl FnOnce(&str, &str) -> String,
) -> Result<String, AppaError> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let run_dir = state.dirs.runs_dir.join(&run_id);
    let comments_file = run_dir
        .join("comments.jsonl")
        .to_string_lossy()
        .into_owned();
    let prompt = build_prompt_fn(&run_id, &comments_file);

    let request = RunRequest {
        spec: spec.clone(),
        prompt,
        run_id: run_id.clone(),
        run_dir,
        workdir: None,
    };
    let handle = LocalProcessRunner.start(request)?;
    let log_path = handle.log_path.to_string_lossy().into_owned();
    let (events, cancel) = handle.split();

    let run = AgentRun {
        run_id: run_id.clone(),
        agent_name: spec.name.clone(),
        repo_slug: repo.slug(),
        pr_number: pr.number,
        head_sha: pr.head_sha.clone(),
        status: RunStatus::Starting,
        started_at: Utc::now(),
        finished_at: None,
        log_path,
        comment_count: 0,
    };
    {
        let cache = state.cache.lock().await;
        cache.put_agent_run(&run)?;
    }
    state.runs.lock().await.insert(run_id.clone(), cancel);

    let head_sha = pr.head_sha.clone();
    tokio::spawn(pump_events(app, events, run, spec, repo, head_sha));
    Ok(run_id)
}

/// Consume a run's event stream: persist comments, keep the run row
/// current, and forward everything to the frontend.
async fn pump_events(
    app: AppHandle,
    mut events: tokio::sync::mpsc::UnboundedReceiver<RunEvent>,
    mut run: AgentRun,
    spec: AgentSpec,
    repo: RepoRef,
    head_sha: String,
) {
    while let Some(event) = events.recv().await {
        if let Err(e) = app.emit("appa://agent-event", &event) {
            tracing::warn!(error = %e, "failed to forward agent event");
        }
        match event.kind {
            RunEventKind::Comment => {
                handle_comment(&app, &event, &mut run, &spec, &repo, &head_sha).await;
            }
            RunEventKind::Lifecycle => {
                if let Some(status) = parse_lifecycle_status(&event.payload) {
                    run.status = status;
                    if matches!(
                        status,
                        RunStatus::Succeeded
                            | RunStatus::Failed
                            | RunStatus::Cancelled
                            | RunStatus::TimedOut
                    ) {
                        run.finished_at = Some(Utc::now());
                    }
                    persist_run(&app, &run).await;
                }
            }
            RunEventKind::Runner | RunEventKind::Raw => {}
        }
    }
    // Stream closed: drop the cancel handle for this run.
    let state = app.state::<AppState>();
    state.runs.lock().await.remove(&run.run_id);
}

async fn handle_comment(
    app: &AppHandle,
    event: &RunEvent,
    run: &mut AgentRun,
    spec: &AgentSpec,
    repo: &RepoRef,
    head_sha: &str,
) {
    let Some(parsed) = parse_comment(&event.payload) else {
        tracing::warn!(payload = %event.payload, "agent emitted malformed appa_comment");
        return;
    };
    let new = NewLocalComment {
        repo: repo.clone(),
        pr_number: run.pr_number,
        head_sha: head_sha.to_owned(),
        path: parsed.path,
        side: if parsed.side == "old" {
            DiffSide::Old
        } else {
            DiffSide::New
        },
        line: parsed.line,
        body: parsed.body,
        author_kind: CommentAuthorKind::Agent,
        author_name: spec.name.clone(),
        severity: parse_severity(&parsed.severity),
        run_id: Some(run.run_id.clone()),
        parent_id: parsed.parent_id.clone(),
    };
    let state = app.state::<AppState>();
    let result = { state.cache.lock().await.add_comment(new) };
    match result {
        Ok(_) => {
            run.comment_count += 1;
            persist_run(app, run).await;
            let payload = serde_json::json!({ "repo": repo.slug(), "number": run.pr_number });
            if let Err(e) = app.emit("appa://comments-updated", payload) {
                tracing::warn!(error = %e, "failed to emit comments-updated");
            }
        }
        Err(e) => tracing::error!(error = %e, "failed to store agent comment"),
    }
}

async fn persist_run(app: &AppHandle, run: &AgentRun) {
    let state = app.state::<AppState>();
    let result = { state.cache.lock().await.put_agent_run(run) };
    if let Err(e) = result {
        tracing::error!(error = %e, "failed to persist agent run");
    }
    if let Err(e) = app.emit("appa://run-updated", run) {
        tracing::warn!(error = %e, "failed to emit run-updated");
    }
}

fn parse_lifecycle_status(payload: &str) -> Option<RunStatus> {
    #[derive(serde::Deserialize)]
    struct Lifecycle {
        status: RunStatus,
    }
    serde_json::from_str::<Lifecycle>(payload)
        .ok()
        .map(|l| l.status)
}

fn parse_severity(s: &str) -> CommentSeverity {
    match s {
        "info" => CommentSeverity::Info,
        "issue" => CommentSeverity::Issue,
        "blocker" => CommentSeverity::Blocker,
        _ => CommentSeverity::Suggestion,
    }
}
