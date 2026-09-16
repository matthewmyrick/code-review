use thiserror::Error;

/// Unified error type for the Tandem workspace.
///
/// Crates map their internal failures into these variants so the Tauri
/// layer can serialize one shape to the frontend.
#[derive(Debug, Error)]
pub enum TandemError {
    #[error("GitHub API error ({status}): {message}")]
    GithubApi { status: u16, message: String },

    #[error("authentication error: {0}")]
    Auth(String),

    #[error("cache error: {0}")]
    Cache(String),

    #[error("agent runner error: {0}")]
    Agent(String),

    #[error("diff parse error: {0}")]
    DiffParse(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

impl serde::Serialize for TandemError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
