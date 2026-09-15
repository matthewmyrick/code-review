//! Classify runner output lines into [`RunEventKind`]s, and parse the
//! `appa_comment` contract agents use to emit review comments.
//!
//! Same approach as agentd's monitor: a line that parses as JSON with a
//! `"type"` field is a structured runner event; everything else is raw.

use appa_core::agent::RunEventKind;
use serde::Deserialize;

/// The payload an agent emits for one review comment.
///
/// Contract (documented to the agent in its run context):
/// `{"type":"appa_comment","path":"src/x.rs","side":"new","line":42,
///   "severity":"issue","body":"..."}`
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct AgentComment {
    pub path: String,
    #[serde(default = "default_side")]
    pub side: String,
    pub line: u64,
    #[serde(default = "default_severity")]
    pub severity: String,
    pub body: String,
}

fn default_side() -> String {
    "new".to_owned()
}

fn default_severity() -> String {
    "suggestion".to_owned()
}

#[derive(Debug, Deserialize)]
struct TypedLine {
    #[serde(rename = "type")]
    kind: String,
}

/// Classify one line of runner stdout.
pub fn classify_line(line: &str) -> RunEventKind {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return RunEventKind::Raw;
    }
    match serde_json::from_str::<TypedLine>(trimmed) {
        Ok(t) if t.kind == "appa_comment" => RunEventKind::Comment,
        Ok(_) => RunEventKind::Runner,
        Err(_) => RunEventKind::Raw,
    }
}

/// Parse an `appa_comment` line. Returns `None` when the line is not a
/// valid comment payload.
pub fn parse_comment(line: &str) -> Option<AgentComment> {
    let trimmed = line.trim();
    if classify_line(trimmed) != RunEventKind::Comment {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn classifies_lines() {
        assert_eq!(classify_line("plain text"), RunEventKind::Raw);
        assert_eq!(classify_line("{not json"), RunEventKind::Raw);
        assert_eq!(
            classify_line(r#"{"type":"assistant","message":"hi"}"#),
            RunEventKind::Runner
        );
        assert_eq!(
            classify_line(r#"{"type":"appa_comment","path":"a.rs","line":1,"body":"x"}"#),
            RunEventKind::Comment
        );
    }

    #[test]
    fn parses_comment_with_defaults() {
        let c = parse_comment(r#"{"type":"appa_comment","path":"a.rs","line":7,"body":"nit"}"#)
            .unwrap();
        assert_eq!(c.path, "a.rs");
        assert_eq!(c.line, 7);
        assert_eq!(c.side, "new");
        assert_eq!(c.severity, "suggestion");
    }

    #[test]
    fn rejects_non_comment_json() {
        assert!(parse_comment(r#"{"type":"assistant"}"#).is_none());
        assert!(parse_comment(r#"{"type":"appa_comment","path":"a.rs"}"#).is_none());
    }
}
