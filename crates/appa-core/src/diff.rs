//! Structured diff types. The Rust side parses raw unified diffs (see
//! [`crate::diff_parse`]) so the frontend only ever renders structure.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Added,
    Removed,
}

/// One rendered line of a diff hunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: LineKind,
    /// Line number in the old file (None for added lines).
    pub old_line: Option<u64>,
    /// Line number in the new file (None for removed lines).
    pub new_line: Option<u64>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hunk {
    pub old_start: u64,
    pub old_count: u64,
    pub new_start: u64,
    pub new_count: u64,
    /// Trailing text on the `@@` header (usually the enclosing function).
    pub section: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Added,
    Removed,
    Modified,
    Renamed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub old_path: String,
    pub new_path: String,
    pub status: FileStatus,
    pub hunks: Vec<Hunk>,
    pub additions: u64,
    pub deletions: u64,
    /// True when the diff body was binary or elided.
    pub is_binary: bool,
}

impl FileDiff {
    /// The path the UI should display (new path, or old path on delete).
    pub fn display_path(&self) -> &str {
        if self.status == FileStatus::Removed {
            &self.old_path
        } else {
            &self.new_path
        }
    }
}
