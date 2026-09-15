//! The v1 agent runner: a local headless process.
//!
//! Every run gets its own directory containing a JSONL event log (the
//! same format agentd uses) and a `comments.jsonl` drop-box the agent
//! can append comments to. Events stream to the caller over a channel
//! so the UI can tail the run live.

use appa_core::agent::{AgentSpec, RunEvent, RunEventKind, RunStatus};
use appa_core::{AppaError, Result};
use chrono::Utc;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot};

use crate::command::build_command;
use crate::events::classify_line;

#[derive(Debug, Clone)]
pub struct RunRequest {
    pub spec: AgentSpec,
    /// Fully assembled prompt (see [`crate::context::build_prompt`]).
    pub prompt: String,
    pub run_id: String,
    /// Directory owned by this run (log + comments file live here).
    pub run_dir: PathBuf,
    /// Working directory for the process; defaults to `run_dir`.
    pub workdir: Option<PathBuf>,
}

/// Cancels a run when triggered; safe to hold after the run ends.
#[derive(Debug)]
pub struct CancelHandle(Option<oneshot::Sender<()>>);

impl CancelHandle {
    /// Ask the run to stop; the child process is killed.
    pub fn cancel(&mut self) {
        if let Some(tx) = self.0.take() {
            let _ = tx.send(());
        }
    }
}

/// Live handle to a running agent.
#[derive(Debug)]
pub struct RunHandle {
    pub run_id: String,
    pub events: mpsc::UnboundedReceiver<RunEvent>,
    pub log_path: PathBuf,
    pub comments_path: PathBuf,
    pub cancel: CancelHandle,
}

impl RunHandle {
    /// Split into the event stream and the cancel handle so they can live
    /// in different places (event pump task vs. app state).
    pub fn split(self) -> (mpsc::UnboundedReceiver<RunEvent>, CancelHandle) {
        (self.events, self.cancel)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct LocalProcessRunner;

impl LocalProcessRunner {
    pub fn start(&self, req: RunRequest) -> Result<RunHandle> {
        std::fs::create_dir_all(&req.run_dir)?;
        let log_path = req.run_dir.join("events.jsonl");
        let comments_path = req.run_dir.join("comments.jsonl");

        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let (cancel_tx, cancel_rx) = oneshot::channel();

        let run_id = req.run_id.clone();
        let emitter = Emitter::new(run_id.clone(), &log_path, event_tx)?;
        let comments = comments_path.clone();
        tokio::spawn(drive(req, emitter, cancel_rx, comments));

        Ok(RunHandle {
            run_id,
            events: event_rx,
            log_path,
            comments_path,
            cancel: CancelHandle(Some(cancel_tx)),
        })
    }
}

/// Serializes events to the log file and the live channel.
struct Emitter {
    run_id: String,
    seq: u64,
    log: std::fs::File,
    tx: mpsc::UnboundedSender<RunEvent>,
}

impl Emitter {
    fn new(
        run_id: String,
        log_path: &PathBuf,
        tx: mpsc::UnboundedSender<RunEvent>,
    ) -> Result<Self> {
        let log = std::fs::File::create(log_path)?;
        Ok(Self {
            run_id,
            seq: 0,
            log,
            tx,
        })
    }

    fn emit(&mut self, kind: RunEventKind, payload: impl Into<String>) {
        let event = RunEvent {
            run_id: self.run_id.clone(),
            seq: self.seq,
            at: Utc::now(),
            kind,
            payload: payload.into(),
        };
        self.seq += 1;
        if let Ok(json) = serde_json::to_string(&event) {
            let _ = writeln!(self.log, "{json}");
        }
        let _ = self.tx.send(event);
    }

    fn lifecycle(&mut self, status: RunStatus, detail: &str) {
        let payload = serde_json::json!({ "status": status, "detail": detail }).to_string();
        self.emit(RunEventKind::Lifecycle, payload);
    }
}

async fn drive(
    req: RunRequest,
    mut emitter: Emitter,
    cancel_rx: oneshot::Receiver<()>,
    comments_path: PathBuf,
) {
    emitter.lifecycle(RunStatus::Starting, &format!("agent {}", req.spec.name));
    match run_process(&req, &mut emitter, cancel_rx, &comments_path).await {
        Ok(status) => emitter.lifecycle(status, "run finished"),
        Err(e) => emitter.lifecycle(RunStatus::Failed, &e.to_string()),
    }
}

async fn run_process(
    req: &RunRequest,
    emitter: &mut Emitter,
    cancel_rx: oneshot::Receiver<()>,
    comments_path: &PathBuf,
) -> Result<RunStatus> {
    let cmd = build_command(&req.spec);
    let workdir = req.workdir.clone().unwrap_or_else(|| req.run_dir.clone());

    let mut child = Command::new(&cmd.program)
        .args(&cmd.args)
        .current_dir(&workdir)
        .envs(&req.spec.env)
        .env("APPA_RUN_ID", &req.run_id)
        .env("APPA_COMMENTS_FILE", comments_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppaError::Agent(format!("failed to spawn `{}`: {e}", cmd.program)))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(req.prompt.as_bytes())
            .await
            .map_err(AppaError::Io)?;
        drop(stdin);
    }

    // Fan both output streams into one internal channel; a single loop
    // below classifies, logs and forwards them in order of arrival.
    let (line_tx, mut line_rx) = mpsc::unbounded_channel::<String>();
    if let Some(stdout) = child.stdout.take() {
        spawn_line_reader(stdout, line_tx.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_line_reader(stderr, line_tx.clone());
    }
    drop(line_tx);

    emitter.lifecycle(RunStatus::Running, "process started");

    let timeout = std::time::Duration::from_secs(req.spec.timeout_minutes * 60);
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);
    tokio::pin!(cancel_rx);

    let mut outcome: Option<RunStatus> = None;
    let exit_ok: bool;
    loop {
        tokio::select! {
            line = line_rx.recv() => match line {
                Some(line) => emitter.emit(classify_line(&line), line),
                // Readers closed: process is done (or streams gone) — wait.
                None => {
                    let status = child.wait().await.map_err(AppaError::Io)?;
                    exit_ok = status.success();
                    break;
                }
            },
            _ = &mut deadline, if outcome.is_none() => {
                let _ = child.start_kill();
                outcome = Some(RunStatus::TimedOut);
            }
            _ = &mut cancel_rx, if outcome.is_none() => {
                let _ = child.start_kill();
                outcome = Some(RunStatus::Cancelled);
            }
        }
    }

    // Collect comments the agent appended to its drop-box file (agents
    // whose stdout is structured runner JSON use this path instead).
    if let Ok(contents) = tokio::fs::read_to_string(comments_path).await {
        for line in contents.lines().filter(|l| !l.trim().is_empty()) {
            if classify_line(line) == RunEventKind::Comment {
                emitter.emit(RunEventKind::Comment, line);
            }
        }
    }

    Ok(outcome.unwrap_or(if exit_ok {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    }))
}

fn spawn_line_reader(
    stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    tx: mpsc::UnboundedSender<String>,
) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use appa_core::agent::{AuthMode, RunnerKind};
    use std::collections::BTreeMap;

    fn spec_with_command(command: &str) -> AgentSpec {
        AgentSpec {
            name: "echo-agent".into(),
            runner: RunnerKind::Custom {
                command: command.to_owned(),
            },
            auth: AuthMode::CliSession,
            model: None,
            allowed_tools: vec![],
            append_system_prompt: None,
            prompt: String::new(),
            env: BTreeMap::new(),
            network_allowlist: vec![],
            timeout_minutes: 1,
        }
    }

    async fn collect(handle: &mut RunHandle) -> Vec<RunEvent> {
        let mut events = Vec::new();
        while let Some(e) = handle.events.recv().await {
            events.push(e);
        }
        events
    }

    #[tokio::test]
    async fn custom_agent_emits_comment_from_stdout() {
        let dir = std::env::temp_dir().join(format!("appa-test-{}", uuid::Uuid::new_v4()));
        let cmd = r#"printf '%s\n' '{"type":"appa_comment","path":"a.rs","line":1,"body":"hi"}'"#;
        let req = RunRequest {
            spec: spec_with_command(cmd),
            prompt: "ignored".into(),
            run_id: "run-test".into(),
            run_dir: dir.clone(),
            workdir: None,
        };
        let mut handle = LocalProcessRunner.start(req).unwrap();
        let events = collect(&mut handle).await;

        assert!(events.iter().any(|e| e.kind == RunEventKind::Comment));
        let last = events.last().expect("events");
        assert_eq!(last.kind, RunEventKind::Lifecycle);
        assert!(last.payload.contains("succeeded"));
        assert!(dir.join("events.jsonl").exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn failing_agent_reports_failure() {
        let dir = std::env::temp_dir().join(format!("appa-test-{}", uuid::Uuid::new_v4()));
        let req = RunRequest {
            spec: spec_with_command("exit 3"),
            prompt: String::new(),
            run_id: "run-fail".into(),
            run_dir: dir.clone(),
            workdir: None,
        };
        let mut handle = LocalProcessRunner.start(req).unwrap();
        let events = collect(&mut handle).await;
        let last = events.last().expect("events");
        assert!(last.payload.contains("failed"));
        std::fs::remove_dir_all(dir).ok();
    }
}
