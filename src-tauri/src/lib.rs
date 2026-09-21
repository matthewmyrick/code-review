//! Tandem's Tauri application shell: state init + command registration.

mod commands;
mod file_config;
mod settings;
mod state;

use commands::{
    agents, conflicts, github_write, merge, prs, review, settings_cmd, text_tools, threads,
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = AppState::init()?;
            // Startup housekeeping: purge archive entries past their
            // 3-day EST deadline (and their run dirs).
            if let Ok(mut cache) = state.cache.try_lock() {
                if let Err(e) = commands::prs::purge_expired_data(&mut cache, &state.dirs.runs_dir)
                {
                    tracing::warn!(error = %e, "startup purge failed");
                }
            }
            tauri::Manager::manage(app, state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prs::get_pull_requests,
            prs::sync_pull_requests,
            prs::get_pr_bundle,
            prs::sync_pr_bundle,
            prs::get_last_synced,
            prs::list_archived_prs,
            prs::search_prs,
            prs::list_my_prs,
            prs::list_failing_checks,
            review::list_local_comments,
            review::add_local_comment,
            review::set_comment_status,
            review::update_comment_body,
            review::delete_local_comment,
            agents::list_agent_specs,
            agents::save_agent_spec,
            agents::delete_agent_spec,
            agents::list_agent_runs,
            agents::list_all_agent_runs,
            agents::start_agent_review,
            agents::cancel_agent_run,
            agents::delete_agent_run,
            threads::reply_to_comment,
            threads::mention_agent,
            conflicts::start_conflict_resolution,
            github_write::post_comment_to_github,
            github_write::approve_pr,
            github_write::reply_on_github,
            github_write::commit_suggestion,
            github_write::resolve_github_thread,
            merge::merge_pr,
            merge::update_pr_branch,
            merge::enable_auto_merge,
            merge::repo_merge_options,
            settings_cmd::get_settings,
            settings_cmd::update_settings,
            settings_cmd::file_config_info,
            settings_cmd::list_github_owners,
            settings_cmd::list_github_repos,
            settings_cmd::list_collaborators,
            text_tools::polish_text,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!(error = %e, "tauri application failed");
        std::process::exit(1);
    }
}
