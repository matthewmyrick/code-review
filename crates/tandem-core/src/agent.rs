//! Agent workflow types: how a "bring your own AI" reviewer is configured
//! and what its runs emit.
//!
//! The schema deliberately mirrors the `agentd` manifest format from
//! dotfiles-ai (runner / model / allowed_tools / append_system_prompt /
//! env_file) so specs feel familiar and could be shared later.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Which backend executes the agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum RunnerKind {
    /// `claude -p --output-format stream-json` (headless Claude Code).
    ClaudeHeadless,
    /// `codex exec --json` (headless Codex).
    CodexHeadless,
    /// Any user-supplied command; stdout treated as the event stream.
    Custom { command: String },
}

/// How the runner reaches its model provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum AuthMode {
    /// Reuse the CLI's own login (claude / codex already authenticated).
    CliSession,
    /// API key exposed to the process via `env_var`.
    ApiKey { env_var: String },
    /// Custom OpenAI-compatible/other endpoint.
    Endpoint {
        base_url: String,
        env_var: Option<String>,
    },
}

/// A configured agent reviewer. Everything here is user-editable in the
/// app's settings UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpec {
    /// Unique name, e.g. "claude-reviewer".
    pub name: String,
    pub runner: RunnerKind,
    pub auth: AuthMode,
    pub model: Option<String>,
    /// Tool allowlist passed to the runner (claude `--allowedTools`).
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    /// Extra system-prompt text appended after Tandem's review context.
    pub append_system_prompt: Option<String>,
    /// The review instructions (what to look for, tone, severity bar).
    pub prompt: String,
    /// Extra environment for the process. Values live in the OS keychain /
    /// env files, never in the cache DB.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Network endpoints the agent may reach. Unenforced in v1 (local
    /// process); v2 enforces this via the Docker + squid sandbox — see
    /// docs/SANDBOXING.md.
    #[serde(default)]
    pub network_allowlist: Vec<String>,
    #[serde(default = "default_timeout_minutes")]
    pub timeout_minutes: u64,
}

fn default_timeout_minutes() -> u64 {
    15
}

/// Lifecycle of one agent run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Starting,
    Running,
    Succeeded,
    Failed,
    Cancelled,
    TimedOut,
}

/// One event on a run's log stream. Runs are persisted as JSONL files of
/// these events (same shape agentd uses), so logs are greppable and the
/// UI can tail them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunEvent {
    pub run_id: String,
    pub seq: u64,
    pub at: DateTime<Utc>,
    pub kind: RunEventKind,
    /// Raw payload (runner JSON line, or plain text for `Raw`).
    pub payload: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunEventKind {
    /// Runner lifecycle (status changes, exit codes).
    Lifecycle,
    /// Structured JSON from the runner (assistant messages, tool use).
    Runner,
    /// A review comment the agent emitted (an `tandem_comment` line).
    Comment,
    /// Unstructured stdout/stderr.
    Raw,
}

/// Summary row for a run, persisted in the cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRun {
    pub run_id: String,
    pub agent_name: String,
    pub repo_slug: String,
    pub pr_number: u64,
    pub head_sha: String,
    pub status: RunStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    /// Path to the JSONL event log on disk.
    pub log_path: String,
    pub comment_count: u64,
}
