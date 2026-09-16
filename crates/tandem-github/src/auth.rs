//! Authentication strategies for GitHub.
//!
//! Everything is user-configurable: reuse the `gh` CLI session, paste a
//! PAT, or point at a GitHub Enterprise endpoint. OAuth device flow is
//! planned (docs/ROADMAP.md) and will slot in as another variant.

use serde::{Deserialize, Serialize};
use tandem_core::{Result, TandemError};
use tokio::process::Command;

/// How Tandem obtains a GitHub token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum GithubAuth {
    /// Shell out to `gh auth token` — reuses the user's existing CLI login.
    GhCli,
    /// A personal access token supplied by the user. Stored in the OS
    /// keychain by the app layer, never in the cache DB.
    Token { token: String },
    /// No auth — public repos only, heavily rate limited.
    Anonymous,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GithubConfig {
    pub auth: GithubAuth,
    /// REST base, e.g. `https://api.github.com` or a GHES
    /// `https://github.example.com/api/v3`.
    pub api_base: String,
}

impl Default for GithubConfig {
    fn default() -> Self {
        Self {
            auth: GithubAuth::GhCli,
            api_base: "https://api.github.com".to_owned(),
        }
    }
}

impl GithubAuth {
    /// Resolve to a bearer token, or `None` for anonymous access.
    pub async fn resolve_token(&self) -> Result<Option<String>> {
        match self {
            Self::Anonymous => Ok(None),
            Self::Token { token } => Ok(Some(token.clone())),
            Self::GhCli => gh_cli_token().await.map(Some),
        }
    }
}

async fn gh_cli_token() -> Result<String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .await
        .map_err(|e| TandemError::Auth(format!("failed to run `gh auth token`: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(TandemError::Auth(format!(
            "`gh auth token` failed — is the gh CLI logged in? ({})",
            stderr.trim()
        )));
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if token.is_empty() {
        return Err(TandemError::Auth(
            "`gh auth token` returned an empty token".to_owned(),
        ));
    }
    Ok(token)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn default_config_uses_gh_cli() {
        let cfg = GithubConfig::default();
        assert_eq!(cfg.auth, GithubAuth::GhCli);
        assert_eq!(cfg.api_base, "https://api.github.com");
    }

    #[tokio::test]
    async fn token_auth_resolves_directly() {
        let auth = GithubAuth::Token {
            token: "ghp_x".to_owned(),
        };
        assert_eq!(
            auth.resolve_token().await.unwrap(),
            Some("ghp_x".to_owned())
        );
    }

    #[tokio::test]
    async fn anonymous_resolves_to_none() {
        assert_eq!(GithubAuth::Anonymous.resolve_token().await.unwrap(), None);
    }
}
