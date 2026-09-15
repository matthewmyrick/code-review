//! Tauri command modules — the IPC surface exposed to the frontend.

pub mod agents;
pub mod prs;
pub mod review;
pub mod settings_cmd;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Payload for `appa://sync` events so the UI can show what's loading.
#[derive(Debug, Clone, Serialize)]
pub struct SyncEvent {
    pub key: String,
    pub phase: SyncPhase,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncPhase {
    Started,
    Finished,
    Error,
}

pub fn emit_sync(app: &AppHandle, key: &str, phase: SyncPhase, error: Option<String>) {
    let event = SyncEvent {
        key: key.to_owned(),
        phase,
        error,
    };
    if let Err(e) = app.emit("appa://sync", &event) {
        tracing::warn!(error = %e, "failed to emit sync event");
    }
}

/// Parse an `owner/name` slug or produce a user-facing config error.
pub fn parse_repo(slug: &str) -> Result<appa_core::github::RepoRef, appa_core::AppaError> {
    appa_core::github::RepoRef::parse(slug)
        .ok_or_else(|| appa_core::AppaError::Config(format!("invalid repo slug: {slug}")))
}
