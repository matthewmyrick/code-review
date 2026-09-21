//! Merge-conflict analysis: compute the likely-conflicting files (PR
//! files ∩ base-branch changes since the merge-base), hand both sides
//! to an agent, and let it open a local general-comment discussion.

use tandem_agents::context::{build_conflict_prompt, ConflictContext, ConflictFile};
use tandem_cache::ReviewStore;
use tandem_core::agent::RunStatus;
use tandem_core::TandemError;
use tauri::{AppHandle, State};

use crate::commands::agents::launch_run;
use crate::commands::parse_repo;
use crate::state::AppState;

const MAX_PATCH_CHARS: usize = 12_000;

#[tauri::command]
pub async fn start_conflict_resolution(
    app: AppHandle,
    state: State<'_, AppState>,
    agent_name: String,
    repo: String,
    number: u64,
) -> Result<String, TandemError> {
    let repo = parse_repo(&repo)?;
    let (spec, pr, raw_diff) = {
        let cache = state.cache.lock().await;
        // One conflict analysis per PR at a time.
        let already_running = cache.list_agent_runs(&repo, number)?.into_iter().any(|r| {
            r.purpose == "conflict analysis"
                && matches!(r.status, RunStatus::Starting | RunStatus::Running)
        });
        if already_running {
            return Err(TandemError::Config(
                "a conflict analysis is already running for this PR".into(),
            ));
        }
        let spec = cache
            .list_agent_specs()?
            .into_iter()
            .find(|s| s.name == agent_name)
            .ok_or_else(|| TandemError::Agent(format!("no agent named {agent_name}")))?;
        let detail = cache
            .get_pr_detail(&repo, number)?
            .ok_or_else(|| TandemError::Agent("PR not synced yet — open it first".into()))?;
        let raw = cache
            .get_raw_diff(&repo, number, &detail.pull_request.head_sha)?
            .unwrap_or_default();
        (spec, detail.pull_request, raw)
    };

    let client = state.github_client().await?;
    let pr_files = client.pr_files(&repo, number).await?;
    let base_changes = client
        .base_changes_since(&repo, &pr.head_sha, &pr.base_ref)
        .await?;

    let files: Vec<ConflictFile> = base_changes
        .into_iter()
        .filter(|(name, _)| pr_files.contains(name))
        .map(|(path, patch)| ConflictFile {
            path,
            base_patch: patch.map(|p| {
                if p.len() > MAX_PATCH_CHARS {
                    format!("{}\n… (patch truncated)", &p[..MAX_PATCH_CHARS])
                } else {
                    p
                }
            }),
        })
        .collect();
    if files.is_empty() {
        return Err(TandemError::Config(
            "couldn't identify overlapping files — the conflict may be in a binary or rename"
                .into(),
        ));
    }

    let pr_for_prompt = pr.clone();
    launch_run(
        app,
        &state,
        spec,
        repo,
        pr,
        "conflict analysis",
        None,
        move |run_id, comments_file| {
            let ctx = ConflictContext {
                run_id: run_id.to_owned(),
                comments_file: comments_file.to_owned(),
                files,
                diff_text: raw_diff,
            };
            build_conflict_prompt(&ctx, &pr_for_prompt)
        },
    )
    .await
}
