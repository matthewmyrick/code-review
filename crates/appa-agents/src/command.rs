//! Build the argv for each runner kind.
//!
//! Flags deliberately mirror agentd (dotfiles-ai) so behaviour matches
//! what already works there:
//! - claude: `claude -p --output-format stream-json --verbose`
//! - codex:  `codex exec --json --skip-git-repo-check -` (prompt on stdin)

use appa_core::agent::{AgentSpec, RunnerKind};

/// A fully resolved program + argument list (prompt is fed via stdin).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunnerCommand {
    pub program: String,
    pub args: Vec<String>,
}

pub fn build_command(spec: &AgentSpec) -> RunnerCommand {
    match &spec.runner {
        RunnerKind::ClaudeHeadless => claude_command(spec),
        RunnerKind::CodexHeadless => codex_command(spec),
        RunnerKind::Custom { command } => custom_command(command),
    }
}

fn claude_command(spec: &AgentSpec) -> RunnerCommand {
    let mut args = vec![
        "-p".to_owned(),
        "--output-format".to_owned(),
        "stream-json".to_owned(),
        "--verbose".to_owned(),
    ];
    if let Some(model) = &spec.model {
        args.push("--model".to_owned());
        args.push(model.clone());
    }
    if !spec.allowed_tools.is_empty() {
        args.push("--allowedTools".to_owned());
        args.push(spec.allowed_tools.join(","));
    }
    if let Some(extra) = &spec.append_system_prompt {
        args.push("--append-system-prompt".to_owned());
        args.push(extra.clone());
    }
    RunnerCommand {
        program: "claude".to_owned(),
        args,
    }
}

fn codex_command(spec: &AgentSpec) -> RunnerCommand {
    let mut args = vec![
        "exec".to_owned(),
        "--json".to_owned(),
        "--skip-git-repo-check".to_owned(),
    ];
    if let Some(model) = &spec.model {
        args.push("-m".to_owned());
        args.push(model.clone());
    }
    args.push("-".to_owned());
    RunnerCommand {
        program: "codex".to_owned(),
        args,
    }
}

/// Custom commands run through the shell so users can write pipelines.
fn custom_command(command: &str) -> RunnerCommand {
    RunnerCommand {
        program: "/bin/sh".to_owned(),
        args: vec!["-c".to_owned(), command.to_owned()],
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use appa_core::agent::AuthMode;
    use std::collections::BTreeMap;

    fn spec(runner: RunnerKind) -> AgentSpec {
        AgentSpec {
            name: "test".into(),
            runner,
            auth: AuthMode::CliSession,
            model: Some("opus".into()),
            allowed_tools: vec!["Read".into(), "Grep".into()],
            append_system_prompt: None,
            prompt: "review this".into(),
            env: BTreeMap::new(),
            network_allowlist: vec![],
            timeout_minutes: 15,
        }
    }

    #[test]
    fn claude_flags_match_agentd() {
        let cmd = build_command(&spec(RunnerKind::ClaudeHeadless));
        assert_eq!(cmd.program, "claude");
        assert_eq!(
            cmd.args,
            vec![
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--model",
                "opus",
                "--allowedTools",
                "Read,Grep"
            ]
        );
    }

    #[test]
    fn codex_reads_prompt_from_stdin() {
        let cmd = build_command(&spec(RunnerKind::CodexHeadless));
        assert_eq!(cmd.program, "codex");
        assert_eq!(cmd.args.last().unwrap(), "-");
        assert!(cmd.args.contains(&"--skip-git-repo-check".to_owned()));
    }

    #[test]
    fn custom_runs_via_shell() {
        let cmd = build_command(&spec(RunnerKind::Custom {
            command: "my-agent | tee log".into(),
        }));
        assert_eq!(cmd.program, "/bin/sh");
        assert_eq!(cmd.args, vec!["-c", "my-agent | tee log"]);
    }
}
